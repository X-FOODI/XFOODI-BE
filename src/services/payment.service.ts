import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';
import { PaymentStatus, PaymentPurpose } from '../enums/payment.enum';
import crypto from 'crypto';
import { getIO } from '../socket';

function getPrisma(): PrismaClient {
  return prismaStorage.getStore() as PrismaClient;
}

// ── SePay config ──────────────────────────────────────────────────────────────
// SePay sends webhook when it detects an incoming bank transfer whose
// description/content matches the pattern you configured in SePay dashboard.
// Convention: order content = "XFOODI {orderId_short}" or "RES {reservationCode}"

export interface SePayWebhookPayload {
  id: number;
  gateway: string;           // "MB Bank", "VCB", etc.
  transactionDate: string;   // "2024-01-15 14:30:22"
  accountNumber: string;
  code: string | null;       // SePay internal code
  content: string;           // Transfer note (e.g. "XFOODI A1B2C3 dat ban")
  transferType: string;       // "in" | "out"
  transferAmount: number;
  accumulated: number;
  referenceCode: string;
  description: string;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CashPaymentDto {
  orderId?: string;
  reservationId?: string;
  cashReceive: number;
  purpose: PaymentPurpose;
}

export interface PaymentFilter {
  restaurantId?: string;
  page?: number;
  limit?: number;
  status?: number;
  from?: string;
  to?: string;
  purpose?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────
export class PaymentService {

  private async getCashMethod() {
    const prisma = getPrisma();
    return prisma.paymentMethod.findFirst({ where: { code: 'CASH' } });
  }

  private async getTransferMethod() {
    const prisma = getPrisma();
    return prisma.paymentMethod.findFirst({ where: { code: 'BANK_TRANSFER' } });
  }

  // ── Finalize Order Payment Helper ──
  private async finalizeOrderPayment(orderId: string, transactionId?: string) {
    const prisma = getPrisma();
    
    // 1. Get COMPLETED status for ORDER
    const completedStatus = await prisma.statusValue.findFirst({
      where: {
        statusType: { code: 'ORDER' },
        code: 'COMPLETED',
      },
    });

    if (completedStatus) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          completedAt: new Date(),
          orderStatusId: completedStatus.id,
        },
      });
    }

    // 2. Fetch order to get restaurantId
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { restaurantId: true },
    });
    
    if (!order) return;

    // 3. Find and close active table sessions linked to this order
    const activeSessions = await prisma.tableSession.findMany({
      where: { orderId, isActive: true },
    });

    // Get AVAILABLE status for TABLE
    const tableStatusType = await prisma.statusType.findUnique({ where: { code: 'TABLE' } });
    let availableStatusId: string | undefined;
    if (tableStatusType) {
      const availableStatus = await prisma.statusValue.findFirst({
        where: { statusTypeId: tableStatusType.id, code: 'AVAILABLE' },
      });
      availableStatusId = availableStatus?.id;
    }

    for (const session of activeSessions) {
      await prisma.tableSession.update({
        where: { id: session.id },
        data: {
          isActive: false,
          endedAt: new Date(),
        },
      });

      if (availableStatusId) {
        await prisma.table.update({
          where: { id: session.tableId },
          data: { tableStatusId: availableStatusId },
        });
      }

      // Broadcast TABLE_SESSION_CLOSED via Socket.io
      try {
        const io = getIO();
        io.to(`restaurant_${order.restaurantId}`).emit('TABLE_SESSION_CLOSED', {
          tableId: session.tableId,
          sessionId: session.id,
          status: 'AVAILABLE',
        });
      } catch (e) {
        console.warn('[PaymentService] Failed to broadcast TABLE_SESSION_CLOSED:', e);
      }
    }

    // Broadcast ORDER_STATUS_CHANGED via Socket.io
    try {
      const io = getIO();
      io.to(`restaurant_${order.restaurantId}`).emit('ORDER_STATUS_CHANGED', {
        orderId,
        status: 'COMPLETED',
      });
    } catch (e) {
      console.warn('[PaymentService] Failed to broadcast ORDER_STATUS_CHANGED:', e);
    }
  }

  // ── Cash payment ─────────────────────────────────────────────────────────────
  async payCash(dto: CashPaymentDto) {
    const prisma = getPrisma();
    const method = await this.getCashMethod();
    if (!method) throw new Error('Cash payment method not configured');

    let amount = 0;

    if (dto.orderId) {
      const order = await prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order) throw new Error('Order not found');
      amount = Number(order.totalAmount);
    } else if (dto.reservationId) {
      const reservation = await prisma.reservation.findUnique({ where: { id: dto.reservationId } });
      if (!reservation) throw new Error('Reservation not found');
      amount = Number(reservation.depositAmount);
    }

    const cashback = Math.max(0, dto.cashReceive - amount);

    const payment = await prisma.payment.create({
      data: {
        orderId: dto.orderId,
        reservationId: dto.reservationId,
        paymentMethodId: method.id,
        amount,
        cashReceive: dto.cashReceive,
        cashback,
        status: PaymentStatus.COMPLETED,
        purpose: dto.purpose,
        paymentDate: new Date(),
      },
      include: { paymentMethod: true },
    });

    // Mark order as paid if applicable
    if (dto.orderId) {
      await this.finalizeOrderPayment(dto.orderId);
    }

    // Mark reservation deposit as paid
    if (dto.reservationId) {
      const confirmedStatus = await prisma.statusValue.findFirst({ where: { code: 'CONFIRMED' } });
      if (confirmedStatus) {
        await prisma.reservation.update({
          where: { id: dto.reservationId },
          data: { reservationStatusId: confirmedStatus.id },
        });
      }
    }

    return payment;
  }

  // ── Generate SePay bank transfer info ────────────────────────────────────────
  // Returns QR/bank details for customer to make the transfer.
  // SePay will send webhook when they detect the transfer.
  async generateTransferInfo(params: {
    reservationId?: string;
    orderId?: string;
    amount: number;
    restaurantId: string;
  }) {
    const prisma = getPrisma();

    // Retrieve bank info from restaurant metadata
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: { metadata: true, name: true },
    });

    const meta = (restaurant?.metadata as any) ?? {};
    const bankInfo = meta.bankInfo ?? {
      bankCode: 'MB',        // Mã ngân hàng
      accountNumber: '',     // Số tài khoản
      accountName: '',       // Tên tài khoản
    };

    // Generate transfer content that SePay can match
    let transferContent = '';
    if (params.reservationId) {
      const res = await prisma.reservation.findUnique({
        where: { id: params.reservationId },
        select: { confirmationCode: true },
      });
      transferContent = `XFOODI RES ${res?.confirmationCode ?? params.reservationId.slice(0, 8).toUpperCase()}`;
    } else if (params.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: params.orderId },
        select: { reference: true },
      });
      transferContent = `XFOODI ORD ${order?.reference ?? params.orderId.slice(0, 8).toUpperCase()}`;
    }

    // Build SePay QR URL (VietQR format)
    const sePayQR = bankInfo.accountNumber
      ? `https://qr.sepay.vn/img?bank=${bankInfo.bankCode}&acc=${bankInfo.accountNumber}&template=compact&amount=${params.amount}&des=${encodeURIComponent(transferContent)}`
      : null;

    // Mark a pending payment record
    const method = await this.getTransferMethod();
    if (!method) throw new Error('BANK_TRANSFER payment method not configured');

    const payment = await prisma.payment.create({
      data: {
        orderId: params.orderId,
        reservationId: params.reservationId,
        paymentMethodId: method.id,
        amount: params.amount,
        cashReceive: 0,
        cashback: 0,
        status: PaymentStatus.PENDING,
        purpose: params.reservationId ? PaymentPurpose.DEPOSIT : PaymentPurpose.ORDER,
        metadata: { transferContent, sePayQR } as any,
      },
      select: { id: true, amount: true, status: true },
    });

    return {
      paymentId: payment.id,
      amount: params.amount,
      transferContent,
      qrUrl: sePayQR,
      bankInfo,
    };
  }

  // ── SePay Webhook handler ─────────────────────────────────────────────────────
  async handleSePayWebhook(payload: SePayWebhookPayload, sePayToken: string) {
    // 1. Verify token
    const expectedToken = process.env.SEPAY_WEBHOOK_TOKEN ?? '';
    if (expectedToken && sePayToken !== expectedToken) {
      throw new Error('Invalid SePay webhook token');
    }

    // Only handle incoming transfers
    if (payload.transferType !== 'in') {
      return { success: true, message: 'Outgoing transfer ignored' };
    }

    const prisma = getPrisma();
    const content = payload.content ?? '';

    // 2. Try to match reservation by code
    const resMatch = content.match(/RES\s+([A-Z0-9]+)/i);
    if (resMatch) {
      const code = resMatch[1].toUpperCase();
      const reservation = await prisma.reservation.findUnique({
        where: { confirmationCode: code },
        include: { payments: { where: { status: PaymentStatus.PENDING, purpose: PaymentPurpose.DEPOSIT } } },
      });

      if (reservation && reservation.payments.length > 0) {
        const payment = reservation.payments[0];
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            transactionId: String(payload.id),
            paymentDate: new Date(payload.transactionDate),
          },
        });

        // Update reservation status to CONFIRMED
        const confirmedStatus = await prisma.statusValue.findFirst({ where: { code: 'CONFIRMED' } });
        if (confirmedStatus) {
          await prisma.reservation.update({
            where: { id: reservation.id },
            data: { reservationStatusId: confirmedStatus.id },
          });
        }

        return { success: true, matched: 'reservation', code, reservationId: reservation.id };
      }
    }

    // 3. Try to match order by reference
    const ordMatch = content.match(/ORD\s+([A-Z0-9\-]+)/i);
    if (ordMatch) {
      const ref = ordMatch[1].toUpperCase();
      const order = await prisma.order.findFirst({
        where: { reference: { contains: ref } },
        include: { payments: { where: { status: PaymentStatus.PENDING } } },
      });

      if (order && order.payments.length > 0) {
        const payment = order.payments[0];
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            transactionId: String(payload.id),
            paymentDate: new Date(payload.transactionDate),
          },
        });

        await this.finalizeOrderPayment(order.id, String(payload.id));

        return { success: true, matched: 'order', ref, orderId: order.id };
      }
    }

    // No match — log but return OK (SePay expects 200)
    console.warn('[SePay Webhook] No matching reservation/order for content:', content);
    return { success: true, matched: null, content };
  }

  // ── List payments ─────────────────────────────────────────────────────────────
  async listPayments(filter: PaymentFilter) {
    const prisma = getPrisma();
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.purpose !== undefined) where.purpose = filter.purpose;
    if (filter.from || filter.to) {
      where.paymentDate = {};
      if (filter.from) where.paymentDate.gte = new Date(filter.from);
      if (filter.to) where.paymentDate.lte = new Date(filter.to);
    }
    if (filter.restaurantId) {
      where.OR = [
        { order: { restaurantId: filter.restaurantId } },
        { reservation: { restaurantId: filter.restaurantId } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          paymentMethod: true,
          order: { select: { id: true, reference: true, totalAmount: true } },
          reservation: { select: { id: true, confirmationCode: true, depositAmount: true } },
          employee: { select: { id: true, user: { select: { fullName: true } } } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Get payment by ID ─────────────────────────────────────────────────────────
  async getById(id: string) {
    const prisma = getPrisma();
    return prisma.payment.findUnique({
      where: { id },
      include: {
        paymentMethod: true,
        order: true,
        reservation: {
          include: {
            customer: { include: { user: { select: { fullName: true, email: true, phoneNumber: true } } } },
          },
        },
      },
    });
  }
}

export const paymentService = new PaymentService();
