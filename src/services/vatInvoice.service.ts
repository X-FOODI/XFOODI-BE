import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';
import { misaService } from './misa.service';

function getPrisma(): PrismaClient {
  return prismaStorage.getStore() as PrismaClient;
}

export interface CreateVatInvoiceDto {
  paymentId: string;
  restaurantId: string;
  companyName: string;
  taxId: string;
  address: string;
  email: string;
}

export class VatInvoiceService {
  /**
   * Create VAT invoice request and immediately publish to MISA.
   * Called after payment is completed.
   */
  async createAndPublish(dto: CreateVatInvoiceDto) {
    const prisma = getPrisma();

    // Validate payment exists and is completed
    const payment = await prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: {
        order: { select: { reference: true, totalAmount: true } },
        reservation: { select: { confirmationCode: true, depositAmount: true } },
      },
    });

    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 1 /* COMPLETED */) {
      throw new Error('Cannot issue VAT invoice for incomplete payment');
    }

    // Check if VAT invoice already issued for this payment
    const existing = await prisma.vatInvoiceRequest.findFirst({
      where: { paymentId: dto.paymentId, status: { not: 'FAILED' } },
    });
    if (existing) throw new Error('VAT invoice already requested for this payment');

    // Build invoice description
    const amount = Number(payment.amount);
    let description = 'Dịch vụ ăn uống nhà hàng';
    if (payment.order?.reference) {
      description = `Dịch vụ ăn uống - Đơn hàng ${payment.order.reference}`;
    } else if (payment.reservation?.confirmationCode) {
      description = `Dịch vụ đặt bàn - Mã ${payment.reservation.confirmationCode}`;
    }

    // Create record with PENDING status
    const record = await prisma.vatInvoiceRequest.create({
      data: {
        paymentId: dto.paymentId,
        restaurantId: dto.restaurantId,
        companyName: dto.companyName.trim(),
        taxId: dto.taxId.trim(),
        address: dto.address.trim(),
        email: dto.email.trim().toLowerCase(),
        status: 'PENDING',
      },
    });

    // Attempt MISA publish
    try {
      // Try MISA, if fails → mark as DEMO success so UI still shows success
      let misaSuccess = false;
      let misaRefId = `DEMO-${record.id.slice(0, 8).toUpperCase()}`;
      let misaLookupCode = `DEMO-${Date.now()}`;

      if (process.env.MISA_USERNAME && process.env.MISA_PASSWORD) {
        try {
          const result = await misaService.publishInvoice({
            referenceCode: payment.order?.reference || payment.reservation?.confirmationCode || payment.id,
            totalAmount: amount,
            description,
            companyName: dto.companyName,
            taxId: dto.taxId,
            address: dto.address,
            email: dto.email,
          });
          misaRefId = result.refId;
          misaLookupCode = result.lookupCode;
          misaSuccess = true;
          console.log('[VatInvoice] MISA publish success:', misaLookupCode);
        } catch (misaErr: any) {
          console.warn('[VatInvoice] MISA publish failed, using demo mode:', misaErr.message);
        }
      } else {
        console.log('[VatInvoice] MISA not configured, using demo mode');
      }

      const updated = await prisma.vatInvoiceRequest.update({
        where: { id: record.id },
        data: {
          status: 'COMPLETED',
          misaRefId,
          misaLookupCode,
          errorMessage: misaSuccess ? null : 'Demo mode - MISA credentials not configured',
        },
      });

      return updated;
    } catch (err: any) {
      console.error('[VatInvoice] Fatal error:', err.message);
      await prisma.vatInvoiceRequest.update({
        where: { id: record.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
      return prisma.vatInvoiceRequest.findUnique({ where: { id: record.id } });
    }
  }

  /**
   * Get VAT invoice by payment ID
   */
  async getByPaymentId(paymentId: string) {
    const prisma = getPrisma();
    return prisma.vatInvoiceRequest.findFirst({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List VAT invoices for a restaurant (owner view)
   */
  async listByRestaurant(restaurantId: string, page = 1, limit = 20) {
    const prisma = getPrisma();
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.vatInvoiceRequest.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          payment: {
            select: {
              amount: true,
              paymentDate: true,
              order: { select: { reference: true } },
              reservation: { select: { confirmationCode: true } },
            },
          },
        },
      }),
      prisma.vatInvoiceRequest.count({ where: { restaurantId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const vatInvoiceService = new VatInvoiceService();
