import { PrismaClient } from '@prisma/client';
import { prismaStorage, centralPrisma, getTenantPrisma, getTenantConnectionUrl } from '../lib/prisma';
import { PaymentStatus, PaymentPurpose } from '../enums/payment.enum';
import crypto from 'crypto';
import { getIO } from '../socket';
import { walletService } from './wallet.service';
import { reservationService } from './reservation.service';
import { loyaltyService } from './loyalty.service';
import { ENV } from '../config/env';

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

function normalizePaymentRef(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/** Parse order/reservation reference from SePay/Momo transfer content (often has extra suffixes). */
function extractRefsFromSePayContent(content: string): { type: 'ORD' | 'RES'; ref: string } | null {
  const upper = content.toUpperCase();

  const dashedOrd = content.match(/ORD-(?:\d{6}-\d{4}-[A-Z0-9]+)/i);
  if (dashedOrd) {
    return { type: 'ORD', ref: dashedOrd[0].toUpperCase() };
  }

  const compactOrd = content.match(/ORD\s+(ORD[A-Z0-9]+)/i);
  if (compactOrd) {
    return { type: 'ORD', ref: compactOrd[1].toUpperCase() };
  }

  const xfoodiOrd = content.match(/XFOODI\s+[A-Z0-9-]+\s+ORD\s+(ORD[A-Z0-9]+)/i);
  if (xfoodiOrd) {
    return { type: 'ORD', ref: xfoodiOrd[1].toUpperCase() };
  }

  const resMatch = content.match(/RES\s+([A-Z0-9]+)/i);
  if (resMatch) {
    return { type: 'RES', ref: resMatch[1].toUpperCase() };
  }

  if (upper.includes(' ORD ')) {
    const loose = content.match(/ORD\s+([A-Z0-9-]{8,24})/i);
    if (loose) {
      const ref = loose[1].split('-CHUYEN')[0].split('-CHUYEN')[0].toUpperCase();
      return { type: 'ORD', ref: ref.replace(/[^A-Z0-9-]/gi, '').toUpperCase().startsWith('ORD') ? ref.replace(/[^A-Z0-9-]/gi, '').toUpperCase() : `ORD${ref.replace(/[^A-Z0-9]/gi, '')}` };
    }
  }

  return null;
}

// ── Service ───────────────────────────────────────────────────────────────────
export class PaymentService {

  private async getCashMethod() {
    const prisma = getPrisma();
    return prisma.paymentMethod.findFirst({ where: { code: 'CASH' } });
  }

  private async getTransferMethod() {
    const prisma = getPrisma();
    let method = await prisma.paymentMethod.findFirst({ where: { code: 'BANK_TRANSFER' } });
    if (!method) {
      method = await prisma.paymentMethod.create({
        data: { code: 'BANK_TRANSFER', name: 'Chuyển khoản', isActive: true },
      });
    }
    return method;
  }

  private normalizePaymentRef(value: string): string {
    return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  /** Parse order/reservation reference from SePay/Momo transfer content */
  private extractPaymentRefFromContent(content: string): { type: 'ORD' | 'RES'; refOrCode: string; slug?: string } | null {
    const dashedOrd = content.match(/XFOODI\s+([A-Za-z0-9-]+)\s+ORD\s+(ORD-\d{6}-\d{4}-[A-Z0-9]+)/i);
    if (dashedOrd) {
      return {
        slug: dashedOrd[1].toLowerCase(),
        type: 'ORD',
        refOrCode: dashedOrd[2].toUpperCase(),
      };
    }

    const compactOrd = content.match(/XFOODI\s+([A-Za-z0-9-]+)\s+ORD\s+(ORD[A-Z0-9]+)/i);
    if (compactOrd) {
      return {
        slug: compactOrd[1].toLowerCase(),
        type: 'ORD',
        refOrCode: compactOrd[2].toUpperCase(),
      };
    }

    const resFormat = content.match(/XFOODI\s+([A-Za-z0-9-]+)\s+RES\s+([A-Z0-9-]+)/i);
    if (resFormat) {
      return {
        slug: resFormat[1].toLowerCase(),
        type: 'RES',
        refOrCode: resFormat[2].toUpperCase(),
      };
    }

    const dashedOrdAnywhere = content.match(/(ORD-\d{6}-\d{4}-[A-Z0-9]+)/i);
    if (dashedOrdAnywhere) {
      return { type: 'ORD', refOrCode: dashedOrdAnywhere[1].toUpperCase() };
    }

    const compactOrdAnywhere = content.match(/\b(ORD[A-Z0-9]{10,24})\b/i);
    if (compactOrdAnywhere) {
      return { type: 'ORD', refOrCode: compactOrdAnywhere[1].toUpperCase() };
    }

    const resMatch = content.match(/RES\s+([A-Z0-9-]+)/i);
    if (resMatch) {
      return { type: 'RES', refOrCode: resMatch[1].toUpperCase() };
    }

    return null;
  }

  private async completeMatchedOrderPayment(params: {
    order: { id: string; restaurantId: string; reference: string };
    payment: { id: string; amount: any };
    payload: SePayWebhookPayload;
  }) {
    const prisma = getPrisma();

    await prisma.payment.update({
      where: { id: params.payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        transactionId: String(params.payload.id),
        paymentDate: new Date(params.payload.transactionDate),
      },
    });

    await this.finalizeOrderPayment(params.order.id, String(params.payload.id));

    if (params.order.restaurantId) {
      try {
        await walletService.creditOrderRevenue({
          restaurantId: params.order.restaurantId,
          orderId: params.order.id,
          paymentId: params.payment.id,
          amount: Number(params.payment.amount),
          paymentMethodCode: 'BANK_TRANSFER',
        });
      } catch (walletErr: any) {
        console.warn('[SePay Webhook] Failed to credit wallet:', walletErr.message);
      }
    }

    try {
      const io = getIO();
      io.to(`restaurant_${params.order.restaurantId}`).emit('PAYMENT_COMPLETED', {
        paymentId: params.payment.id,
        orderId: params.order.id,
        restaurantId: params.order.restaurantId,
        status: PaymentStatus.COMPLETED,
      });
    } catch (e) {
      console.warn('[PaymentService] Failed to broadcast PAYMENT_COMPLETED:', e);
    }

    return {
      matched: true,
      type: 'order',
      details: { orderId: params.order.id, ref: params.order.reference, paymentId: params.payment.id },
    };
  }

  // ── Finalize Order Payment Helper ──
  private async finalizeOrderPayment(orderId: string, transactionId?: string) {
    const prisma = getPrisma();

    // ── Gather everything we need up front (read-only) ──
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { restaurantId: true, metadata: true },
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

      // Mark voucher as used if there is one applied
      const orderMeta = order?.metadata as any;
      if (orderMeta?.appliedVoucher?.userVoucherId) {
        await prisma.userVoucher.update({
          where: { id: orderMeta.appliedVoucher.userVoucherId },
          data: {
            isUsed: true,
            usedAt: new Date()
          }
        });
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

    if (dto.cashReceive < amount) {
      throw new Error(`Số tiền nhận từ khách (${dto.cashReceive.toLocaleString('vi-VN')}đ) không đủ để thanh toán số tiền cần trả (${amount.toLocaleString('vi-VN')}đ)`);
    }

    const cashback = dto.cashReceive - amount;

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

    if (!params.amount || Number(params.amount) <= 0) {
      throw new Error('Số tiền thanh toán không hợp lệ');
    }
    if (!params.orderId && !params.reservationId) {
      throw new Error('Thiếu orderId hoặc reservationId');
    }

    // Retrieve bank info from restaurant metadata
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: { metadata: true, name: true, slug: true },
    });
    if (!restaurant) {
      throw new Error('Không tìm thấy nhà hàng');
    }

    const meta = (restaurant.metadata as any) ?? {};
    const bankInfo = meta.bankInfo ?? meta.paymentBank ?? (
      process.env.ADMIN_BANK_ACCOUNT
        ? {
            bankCode: process.env.ADMIN_BANK_CODE || 'MB',
            accountNumber: process.env.ADMIN_BANK_ACCOUNT,
            accountName: process.env.ADMIN_BANK_NAME || '',
          }
        : null
    );

    if (!bankInfo?.accountNumber || !bankInfo?.bankCode) {
      throw new Error(
        'Nhà hàng chưa cấu hình tài khoản nhận chuyển khoản (metadata.bankInfo). Vui lòng cấu hình số tài khoản trong Cài đặt hoặc chọn thanh toán tiền mặt.'
      );
    }

    const slug = restaurant.slug || 'default';

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
    const sePayQR = `https://qr.sepay.vn/img?bank=${encodeURIComponent(bankInfo.bankCode)}&acc=${encodeURIComponent(bankInfo.accountNumber)}&template=compact&amount=${Math.round(Number(params.amount))}&des=${encodeURIComponent(transferContent)}`;

    // Mark a pending payment record (reuse existing pending payment for same order/reservation)
    const method = await this.getTransferMethod();
    if (!method) throw new Error('BANK_TRANSFER payment method not configured');

    const existingPending = await prisma.payment.findFirst({
      where: {
        status: PaymentStatus.PENDING,
        purpose: params.reservationId ? PaymentPurpose.DEPOSIT : PaymentPurpose.ORDER,
        ...(params.orderId ? { orderId: params.orderId } : {}),
        ...(params.reservationId ? { reservationId: params.reservationId } : {}),
        paymentMethodId: method.id,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, status: true, metadata: true },
    });

    let payment = existingPending;
    if (payment) {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          amount: params.amount,
          metadata: { transferContent, sePayQR, bankInfo } as any,
        },
        select: { id: true, amount: true, status: true, metadata: true },
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          orderId: params.orderId,
          reservationId: params.reservationId,
          paymentMethodId: method.id,
          amount: params.amount,
          cashReceive: 0,
          cashback: 0,
          status: PaymentStatus.PENDING,
          purpose: params.reservationId ? PaymentPurpose.DEPOSIT : PaymentPurpose.ORDER,
          metadata: { transferContent, sePayQR, bankInfo } as any,
        },
        select: { id: true, amount: true, status: true, metadata: true },
      });
    }

    return {
      paymentId: payment.id,
      amount: Number(payment.amount),
      transferContent,
      qrUrl: sePayQR,
      bankInfo: {
        bankCode: bankInfo.bankCode,
        accountNumber: bankInfo.accountNumber,
        accountName: bankInfo.accountName || '',
      },
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
    const parsed = this.extractPaymentRefFromContent(content);

    if (parsed?.slug) {
      const restaurant = await centralPrisma.restaurant.findFirst({
        where: { slug: parsed.slug, isActive: true },
      });

      if (restaurant) {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);

        const result = await prismaStorage.run(tenantPrisma, async () => {
          return this.processMatchedPayment({
            type: parsed.type,
            refOrCode: parsed.refOrCode,
            payload,
            restaurantId: restaurant.id,
            content,
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

    if (parsed) {
      for (const restaurant of activeRestaurants) {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);

        const result = await prismaStorage.run(tenantPrisma, async () => {
          return this.processMatchedPayment({
            type: parsed.type,
            refOrCode: parsed.refOrCode,
            payload,
            restaurantId: restaurant.id,
            content,
          });
        });

        if (result.matched) {
          return {
            success: true,
            matched: result.type,
            slug: restaurant.slug,
            ...result.details,
            note: 'Resolved via fallback scan',
          };
        }
      }
    }

    // Last resort: match pending payment by transferContent stored in metadata
    for (const restaurant of activeRestaurants) {
      const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
      const tenantPrisma = getTenantPrisma(tenantDbUrl);

      const result = await prismaStorage.run(tenantPrisma, async () => {
        return this.processMatchedPaymentByMetadata({ payload, restaurantId: restaurant.id, content });
      });

      if (result.matched) {
        return {
          success: true,
          matched: result.type,
          slug: restaurant.slug,
          ...result.details,
          note: 'Resolved via transferContent metadata',
        };
      }
    }

    // No match — log but return OK (SePay expects 200)
    console.warn('[SePay Webhook] No matching reservation/order for content:', content);
    return { success: true, matched: null, content };
  }

  private async processMatchedPaymentByMetadata(params: {
    payload: SePayWebhookPayload;
    restaurantId: string;
    content: string;
  }) {
    const prisma = getPrisma();
    const normContent = this.normalizePaymentRef(params.content);

    const pendingPayments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        orderId: { not: null },
        purpose: PaymentPurpose.ORDER,
        order: { restaurantId: params.restaurantId },
      },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    for (const payment of pendingPayments) {
      const transferContent = (payment.metadata as any)?.transferContent as string | undefined;
      if (!transferContent) continue;

      const normTransfer = this.normalizePaymentRef(transferContent);
      if (!normContent.includes(normTransfer) && !normTransfer.includes(normContent.slice(-normTransfer.length))) {
        continue;
      }

      if (Math.abs(Number(payment.amount) - Number(params.payload.transferAmount)) > 1) {
        continue;
      }

      if (!payment.order) continue;

      return this.completeMatchedOrderPayment({
        order: { ...payment.order, restaurantId: payment.order.restaurantId ?? '' },
        payment,
        payload: params.payload,
      });
    }

    return { matched: false as const };
  }

  // ── SePay payment processor helper ──
  private async processMatchedPayment(params: {
    type: 'ORD' | 'RES' | string;
    refOrCode: string;
    payload: SePayWebhookPayload;
    restaurantId: string;
    content: string;
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

        // Notify customer waiting on QR screen + restaurant staff
        try {
          const io = getIO();
          // To customer page (joined reservation_${id} room)
          io.to(`reservation_${reservation.id}`).emit('DEPOSIT_PAID', {
            reservationId: reservation.id,
            paymentId: payment.id,
            status: PaymentStatus.COMPLETED,
          });
          // To restaurant staff dashboard
          if (params.restaurantId) {
            io.to(`restaurant_${params.restaurantId}`).emit('DEPOSIT_PAID', {
              reservationId: reservation.id,
              paymentId: payment.id,
              status: PaymentStatus.COMPLETED,
            });
          }
        } catch (e) {
          console.warn('[PaymentService] Failed to broadcast DEPOSIT_PAID:', e);
        }

        return {
          matched: true,
          type: 'reservation',
          details: { reservationId: reservation.id, code: params.refOrCode },
        };
      }
    } else if (params.type === 'ORD') {
      const normalizedRef = this.normalizePaymentRef(params.refOrCode);
      const pendingOrders = await prisma.order.findMany({
        where: {
          restaurantId: params.restaurantId,
          payments: { some: { status: PaymentStatus.PENDING, purpose: PaymentPurpose.ORDER } },
        },
        include: {
          payments: {
            where: { status: PaymentStatus.PENDING, purpose: PaymentPurpose.ORDER },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const order = pendingOrders.find((o) => {
        const orderNorm = this.normalizePaymentRef(o.reference);
        return (
          orderNorm === normalizedRef ||
          orderNorm.includes(normalizedRef) ||
          normalizedRef.includes(orderNorm)
        );
      });

      if (order && order.payments.length > 0) {
        const payment = order.payments[0];
        if (Math.abs(Number(payment.amount) - Number(params.payload.transferAmount)) > 1) {
          return { matched: false as const };
        }
        return this.completeMatchedOrderPayment({ order: { ...order, restaurantId: order.restaurantId ?? '' }, payment, payload: params.payload });
      }

      // Fallback within tenant: match by transferContent metadata
      return this.processMatchedPaymentByMetadata({
        payload: params.payload,
        restaurantId: params.restaurantId,
        content: params.content,
      });
    }

    return { matched: false as const };
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

  /**
   * Gộp giao dịch từ TẤT CẢ tenant schema cho admin nền tảng.
   * Payment là dữ liệu tenant nên phải lặp qua từng schema, gắn tên nhà hàng
   * (central) rồi trộn/lọc/phân trang trong bộ nhớ.
   */
  async listAllPlatformPayments(filter: { page?: number; limit?: number; search?: string }) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 15;
    const search = (filter.search || '').trim().toLowerCase();

    const restaurants = await centralPrisma.restaurant.findMany({ select: { id: true, name: true, slug: true } });

    const all: any[] = [];
    for (const r of restaurants) {
      if (r.slug === 'system') continue;
      try {
        const tp = getTenantPrisma(getTenantConnectionUrl(ENV.DATABASE_URL, r.slug));
        const rows = await tp.payment.findMany({
          orderBy: { paymentDate: 'desc' },
          take: 500,
          include: {
            paymentMethod: { select: { code: true, name: true } },
            order: { select: { reference: true, totalAmount: true } },
            reservation: { select: { confirmationCode: true, depositAmount: true } },
          },
        });
        for (const p of rows) {
          const rest = { name: r.name, slug: r.slug };
          all.push({
            id: p.id,
            amount: Number(p.amount),
            status: p.status,
            paymentDate: p.paymentDate,
            transactionId: p.transactionId,
            paymentMethod: p.paymentMethod,
            order: p.order ? { ...p.order, totalAmount: Number(p.order.totalAmount), restaurant: rest } : undefined,
            reservation: p.reservation
              ? { ...p.reservation, depositAmount: Number(p.reservation.depositAmount), restaurant: rest }
              : undefined,
          });
        }
      } catch (e: any) {
        console.warn(`[Payments] Bỏ qua tenant ${r.slug}: ${e.message}`);
      }
    }

    let filtered = all;
    if (search) {
      filtered = all.filter((p) => {
        const ref = p.order?.reference || p.reservation?.confirmationCode || '';
        const restName = p.order?.restaurant?.name || p.reservation?.restaurant?.name || '';
        return (
          (p.transactionId || '').toLowerCase().includes(search) ||
          ref.toLowerCase().includes(search) ||
          restName.toLowerCase().includes(search)
        );
      });
    }

    filtered.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

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

  /** Public status poll for guest checkout (QR waiting screen) */
  async getPublicPaymentStatus(paymentId: string, orderId?: string) {
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, orderId: true, reservationId: true },
    });
    if (!payment) {
      throw new Error('Payment not found');
    }
    if (orderId && payment.orderId && payment.orderId !== orderId) {
      throw new Error('Payment does not belong to this order');
    }
    return { status: payment.status as PaymentStatus, orderId: payment.orderId, reservationId: payment.reservationId };
  }
}

export const paymentService = new PaymentService();
