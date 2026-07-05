import { PrismaClient } from '@prisma/client';
import { prismaStorage, centralPrisma, getTenantPrisma, getTenantConnectionUrl } from '../lib/prisma';
import { PaymentStatus, PaymentPurpose } from '../enums/payment.enum';
import crypto from 'crypto';
import { getIO } from '../socket';
import { walletService } from './wallet.service';
import { reservationService } from './reservation.service';
import { loyaltyService } from './loyalty.service';

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

    // ── Gather everything we need up front (read-only) ──
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { restaurantId: true },
    });
    if (!order) return;

    const completedStatus = await prisma.statusValue.findFirst({
      where: { statusType: { code: 'ORDER' }, code: 'COMPLETED' },
    });

    const detailStatusType = await prisma.statusType.findUnique({ where: { code: 'ORDER_DETAIL' } });
    let completedDetailStatusId: string | undefined;
    if (detailStatusType) {
      const completedDetailStatus = await prisma.statusValue.findFirst({
        where: { statusTypeId: detailStatusType.id, code: 'COMPLETED' },
      });
      completedDetailStatusId = completedDetailStatus?.id;
    }

    const activeSessions = await prisma.tableSession.findMany({
      where: { orderId, isActive: true },
    });

    const tableStatusType = await prisma.statusType.findUnique({ where: { code: 'TABLE' } });
    let availableStatusId: string | undefined;
    if (tableStatusType) {
      const availableStatus = await prisma.statusValue.findFirst({
        where: { statusTypeId: tableStatusType.id, code: 'AVAILABLE' },
      });
      availableStatusId = availableStatus?.id;
    }

    // ── Apply all writes atomically so an order can never be marked COMPLETED
    //    while its tables remain OCCUPIED (or vice versa). ──
    await prisma.$transaction(async (tx) => {
      if (completedStatus) {
        await tx.order.update({
          where: { id: orderId },
          data: { completedAt: new Date(), orderStatusId: completedStatus.id },
        });

        if (completedDetailStatusId) {
          await tx.orderDetail.updateMany({
            where: { orderId },
            data: { itemStatusId: completedDetailStatusId },
          });
        }
      }

      for (const session of activeSessions) {
        await tx.tableSession.update({
          where: { id: session.id },
          data: { isActive: false, endedAt: new Date() },
        });

        if (availableStatusId) {
          await tx.table.update({
            where: { id: session.tableId },
            data: { tableStatusId: availableStatusId },
          });
        }
      }
    });

    // ── Side effects after the data is durably committed ──
    for (const session of activeSessions) {
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

    try {
      const io = getIO();
      io.to(`restaurant_${order.restaurantId}`).emit('ORDER_STATUS_CHANGED', {
        orderId,
        status: 'COMPLETED',
        isPaid: true,
      });
    } catch (e) {
      console.warn('[PaymentService] Failed to broadcast ORDER_STATUS_CHANGED:', e);
    }

    // ── Loyalty Points: Fire-and-forget — must not fail the payment flow ──
    loyaltyService.calculateAndRewardPoints(orderId).catch((e) => {
      console.warn('[PaymentService] Loyalty points reward failed for order', orderId, ':', e.message);
    });
  }

  // ── Cash payment ─────────────────────────────────────────────────────────────
  async payCash(dto: CashPaymentDto) {
    const prisma = getPrisma();
    const method = await this.getCashMethod();
    if (!method) throw new Error('Cash payment method not configured');

    let amount = 0;

    if (dto.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: dto.orderId },
        include: {
          reservation: {
            include: {
              payments: {
                where: { status: PaymentStatus.COMPLETED, purpose: PaymentPurpose.DEPOSIT },
                select: { amount: true },
              },
            },
          },
        },
      });
      if (!order) throw new Error('Order not found');

      // Tính tổng tiền cọc đã thanh toán cho reservation của order này
      const depositPaid = order.reservation
        ? order.reservation.payments.reduce((sum, p) => sum + Number(p.amount), 0)
        : 0;

      // Trừ tiền cọc — khách chỉ cần trả số tiền còn lại
      amount = Math.max(0, Number(order.totalAmount) - depositPaid);
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

      // Credit restaurant owner wallet with this order's revenue
      try {
        const order = await prisma.order.findUnique({ where: { id: dto.orderId } });
        if (order?.restaurantId) {
          await walletService.creditOrderRevenue({
            restaurantId: order.restaurantId,
            orderId: order.id,
            paymentId: payment.id,
            amount: Number(payment.amount),
            paymentMethodCode: 'CASH',
          });
        }
      } catch (walletErr: any) {
        console.warn('[Cash Payment] Failed to credit wallet:', walletErr.message);
      }
    }

    // Mark reservation deposit as paid. Scope to the RESERVATION status type —
    // a 'CONFIRMED' code can also exist under other status types.
    if (dto.reservationId) {
      const confirmedStatus = await prisma.statusValue.findFirst({
        where: { code: 'CONFIRMED', statusType: { code: 'RESERVATION' } },
      });
      await prisma.reservation.update({
        where: { id: dto.reservationId },
        data: {
          paymentDeadline: null,
          ...(confirmedStatus && { reservationStatusId: confirmedStatus.id }),
        },
      });
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
      select: { metadata: true, name: true, slug: true },
    });

    const meta = (restaurant?.metadata as any) ?? {};
    const bankInfo = meta.bankInfo ?? {
      bankCode: 'MB',        // Mã ngân hàng
      accountNumber: '',     // Số tài khoản
      accountName: '',       // Tên tài khoản
    };

    const slug = restaurant?.slug || 'default';

    // Generate transfer content that SePay can match
    let transferContent = '';
    if (params.reservationId) {
      const res = await prisma.reservation.findUnique({
        where: { id: params.reservationId },
        select: { confirmationCode: true },
      });
      transferContent = `XFOODI ${slug} RES ${res?.confirmationCode ?? params.reservationId.slice(0, 8).toUpperCase()}`;
    } else if (params.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: params.orderId },
        select: { reference: true },
      });
      transferContent = `XFOODI ${slug} ORD ${order?.reference ?? params.orderId.slice(0, 8).toUpperCase()}`;
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
  // ── SePay Webhook handler ─────────────────────────────────────────────────────
  async handleSePayWebhook(payload: SePayWebhookPayload, sePayToken: string) {
    // 1. Verify token. The token MUST be configured — without it anyone could
    //    POST fake payment confirmations, so we fail closed instead of skipping.
    const expectedToken = process.env.SEPAY_WEBHOOK_TOKEN ?? process.env.SEPAY_WEBHOOK_KEY ?? '';
    if (!expectedToken) {
      throw new Error('SePay webhook token is not configured (SEPAY_WEBHOOK_TOKEN)');
    }
    if (sePayToken !== expectedToken) {
      throw new Error('Invalid SePay webhook token');
    }

    // Only handle incoming transfers
    if (payload.transferType !== 'in') {
      return { success: true, message: 'Outgoing transfer ignored' };
    }

    const content = payload.content ?? '';

    // Fast Path: Try to parse slug and route directly
    // Pattern: XFOODI\s+([A-Za-z0-9-]+)\s+(ORD|RES)\s+([A-Z0-9-]+)
    const newFormatMatch = content.match(/XFOODI\s+([A-Za-z0-9-]+)\s+(ORD|RES)\s+([A-Z0-9-]+)/i);

    if (newFormatMatch) {
      const slug = newFormatMatch[1].toLowerCase();
      const type = newFormatMatch[2].toUpperCase();
      const refOrCode = newFormatMatch[3].toUpperCase();

      // Find restaurant in central database
      const restaurant = await centralPrisma.restaurant.findFirst({
        where: { slug, isActive: true },
      });

      if (restaurant) {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);

        // Run within the context of the tenant database
        const result = await prismaStorage.run(tenantPrisma, async () => {
          return this.processMatchedPayment({
            type,
            refOrCode,
            payload,
            restaurantId: restaurant.id,
          });
        });

        if (result.matched) {
          return { success: true, matched: result.type, slug: restaurant.slug, ...result.details };
        }
      }
    }

    // Fallback Path: Scan all active tenants to match the order or reservation reference
    const activeRestaurants = await centralPrisma.restaurant.findMany({
      where: { isActive: true },
    });

    const ordMatch = content.match(/ORD\s+([A-Z0-9-]+)/i) || content.match(/(ORD-[A-Z0-9-]+)/i);
    const resMatch = content.match(/RES\s+([A-Z0-9]+)/i);

    const type = ordMatch ? 'ORD' : (resMatch ? 'RES' : null);
    const refOrCode = ordMatch ? ordMatch[1].toUpperCase() : (resMatch ? resMatch[1].toUpperCase() : null);

    if (type && refOrCode) {
      for (const restaurant of activeRestaurants) {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);

        const result = await prismaStorage.run(tenantPrisma, async () => {
          return this.processMatchedPayment({
            type,
            refOrCode,
            payload,
            restaurantId: restaurant.id,
          });
        });

        if (result.matched) {
          return { 
            success: true, 
            matched: result.type, 
            slug: restaurant.slug, 
            ...result.details, 
            note: 'Resolved via fallback scan' 
          };
        }
      }
    }

    // No match — log but return OK (SePay expects 200)
    console.warn('[SePay Webhook] No matching reservation/order for content:', content);
    return { success: true, matched: null, content };
  }

  // ── SePay payment processor helper ──
  private async processMatchedPayment(params: {
    type: 'ORD' | 'RES' | string;
    refOrCode: string;
    payload: SePayWebhookPayload;
    restaurantId: string;
  }) {
    const prisma = getPrisma();

    if (params.type === 'RES') {
      const normalizedCode = params.refOrCode.replace(/[^A-Z0-9]/ig, '').toUpperCase();
      const pendingReservations = await prisma.reservation.findMany({
        where: {
          payments: { some: { status: PaymentStatus.PENDING, purpose: PaymentPurpose.DEPOSIT } }
        },
        include: { payments: { where: { status: PaymentStatus.PENDING, purpose: PaymentPurpose.DEPOSIT } } },
      });

      // Exact match only — substring matching could credit the wrong reservation.
      const reservation = pendingReservations.find(r => {
        if (!r.confirmationCode) return false;
        const codeNorm = r.confirmationCode.replace(/[^A-Z0-9]/ig, '').toUpperCase();
        return codeNorm === normalizedCode;
      });

      if (reservation && reservation.payments.length > 0) {
        const payment = reservation.payments[0];
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            transactionId: String(params.payload.id),
            paymentDate: new Date(params.payload.transactionDate),
          },
        });

        // Clear payment deadline, leave status as PENDING awaiting owner confirmation
        await prisma.reservation.update({
          where: { id: reservation.id },
          data: { paymentDeadline: null },
        });

        return {
          matched: true,
          type: 'reservation',
          details: { reservationId: reservation.id, code: params.refOrCode },
        };
      }
    } else if (params.type === 'ORD') {
      const normalizedRef = params.refOrCode.replace(/[^A-Z0-9]/ig, '').toUpperCase();
      const pendingOrders = await prisma.order.findMany({
        where: {
          payments: { some: { status: PaymentStatus.PENDING } }
        },
        include: { payments: { where: { status: PaymentStatus.PENDING } } },
      });

      // Exact match only. Substring matching could credit the wrong order when
      // one reference is contained in another — for money, an unmatched payment
      // (manual reconciliation) is far safer than crediting the wrong order.
      const order = pendingOrders.find(o => {
        const orderNorm = o.reference.replace(/[^A-Z0-9]/ig, '').toUpperCase();
        return orderNorm === normalizedRef;
      });

      if (order && order.payments.length > 0) {
        const payment = order.payments[0];
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            transactionId: String(params.payload.id),
            paymentDate: new Date(params.payload.transactionDate),
          },
        });

        await this.finalizeOrderPayment(order.id, String(params.payload.id));

        // Credit restaurant owner wallet with this order's revenue
        if (order.restaurantId) {
          try {
            await walletService.creditOrderRevenue({
              restaurantId: order.restaurantId,
              orderId: order.id,
              paymentId: payment.id,
              amount: Number(payment.amount),
              paymentMethodCode: 'BANK_TRANSFER',
            });
          } catch (walletErr: any) {
            console.warn('[SePay Webhook] Failed to credit wallet:', walletErr.message);
          }
        }

        return {
          matched: true,
          type: 'order',
          details: { orderId: order.id, ref: params.refOrCode },
        };
      }
    }

    return { matched: false };
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
