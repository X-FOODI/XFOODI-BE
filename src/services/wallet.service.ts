/**
 * Restaurant Wallet Service
 * -----------------------------------------------------------
 * Handles revenue crediting (from SePay webhook) and
 * withdrawal requests (disbursed via PayOS).
 *
 * Architecture:
 *   - Money physically lives in admin's bank account (one SePay account for whole platform)
 *   - This service tracks a LEDGER balance per restaurant
 *   - Owner can request withdrawal → admin approves → PayOS disburses
 */
import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';


function getPrisma(): PrismaClient {
  return prismaStorage.getStore() as PrismaClient;
}

// ── PayOS client (singleton) ──────────────────────────────────────────────────
function getPayOS(): any | null {
  const clientId = process.env.PAYOS_CLIENT_ID?.trim();
  const apiKey = process.env.PAYOS_API_KEY?.trim();
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim();

  if (!clientId || !apiKey || !checksumKey) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PayOS } = require('@payos/node');
    return new PayOS({ clientId, apiKey, checksumKey });
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WithdrawDto {
  restaurantId: string;
  amount: number;
  bankCode: string;     // e.g. "MB"
  bankBin: string;      // e.g. "970422"
  accountNumber: string;
  accountName: string;
}

export interface WalletFilter {
  restaurantId: string;
  page?: number;
  limit?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────
export class WalletService {

  /**
   * Get or create wallet for a restaurant.
   */
  async getOrCreateWallet(restaurantId: string) {
    const prisma = getPrisma();
    const existing = await prisma.restaurantWallet.findUnique({
      where: { restaurantId },
    });
    if (existing) return existing;

    return prisma.restaurantWallet.create({
      data: { restaurantId, balance: 0, lifetimeEarned: 0 },
    });
  }

  /**
   * Credit revenue to restaurant wallet after a successful order payment.
   * Called from the SePay webhook handler.
   */
  async creditOrderRevenue(params: {
    restaurantId: string;
    orderId: string;
    paymentId: string;
    amount: number;
    paymentMethodCode?: string;
  }) {
    const prisma = getPrisma();
    const wallet = await this.getOrCreateWallet(params.restaurantId);

    const isCash = params.paymentMethodCode === 'CASH';
    const before = Number(wallet.balance);
    const after = isCash ? before : before + params.amount;

    // Update balance atomically
    if (isCash) {
      await prisma.restaurantWallet.update({
        where: { id: wallet.id },
        data: {
          cashBalance: { increment: params.amount },
          lifetimeEarned: { increment: params.amount },
        },
      });
    } else {
      await prisma.restaurantWallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: params.amount },
          lifetimeEarned: { increment: params.amount },
        },
      });
    }

    // Record transaction
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: isCash ? 'CASH_REVENUE' : 'ORDER_REVENUE',
        amount: params.amount,
        balanceBefore: before,
        balanceAfter: after,
        orderId: params.orderId,
        paymentId: params.paymentId,
        description: isCash ? 'Doanh thu tiền mặt' : 'Doanh thu chuyển khoản',
        metadata: { orderId: params.orderId, paymentMethodCode: params.paymentMethodCode },
      },
    });

    return { walletId: wallet.id, newBalance: after };
  }

  /**
   * Get wallet summary + recent transactions.
   */
  async getWallet(restaurantId: string) {
    const prisma = getPrisma();
    const wallet = await this.getOrCreateWallet(restaurantId);

    const [transactions, pendingWithdrawals] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.withdrawalRequest.findMany({
        where: { walletId: wallet.id, status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Locked = sum of pending/processing withdrawals
    const locked = pendingWithdrawals.reduce(
      (sum, w) => sum + Number(w.amount),
      0,
    );

    return {
      wallet,
      availableBalance: Math.max(0, Number(wallet.balance) - locked),
      lockedBalance: locked,
      transactions,
      pendingWithdrawals,
    };
  }

  /**
   * Request a withdrawal. Deducts from available balance immediately (pessimistic lock).
   */
  async requestWithdrawal(dto: WithdrawDto) {
    const prisma = getPrisma();
    const wallet = await this.getOrCreateWallet(dto.restaurantId);

    // Check available balance (subtract pending withdrawals)
    const pending = await prisma.withdrawalRequest.findMany({
      where: { walletId: wallet.id, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    const locked = pending.reduce((s, w) => s + Number(w.amount), 0);
    const available = Number(wallet.balance) - locked;

    if (dto.amount > available) {
      throw new Error(
        `Số dư khả dụng không đủ. Khả dụng: ${available.toLocaleString('vi-VN')}đ`,
      );
    }

    if (dto.amount < 10000) {
      throw new Error('Số tiền rút tối thiểu là 10,000đ');
    }

    const request = await prisma.withdrawalRequest.create({
      data: {
        walletId: wallet.id,
        restaurantId: dto.restaurantId,
        amount: dto.amount,
        bankCode: dto.bankCode,
        bankBin: dto.bankBin,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        status: 'PENDING',
      },
    });

    return request;
  }

  /**
   * [ADMIN] Get all withdrawal requests.
   */
  async listWithdrawals(filter: { status?: string; page?: number; limit?: number }) {
    const prisma = getPrisma();
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: any = {};
    if (filter.status) where.status = filter.status;

    const [items, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: { include: { restaurant: { select: { name: true, slug: true } } } },
        },
      }),
      prisma.withdrawalRequest.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * [ADMIN] Approve withdrawal → disburse via PayOS → deduct balance.
   */
  async approveWithdrawal(withdrawalId: string, adminNote?: string) {
    const prisma = getPrisma();
    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      include: { wallet: true },
    });

    if (!withdrawal) throw new Error('Yêu cầu rút tiền không tồn tại');
    if (withdrawal.status !== 'PENDING') {
      throw new Error('Yêu cầu này đã được xử lý rồi');
    }

    // Mark processing
    await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: 'PROCESSING', adminNote },
    });

    try {
      // Try PayOS payout
      const payos = getPayOS();
      let externalTxId = `MANUAL_${Date.now()}`;

      if (payos) {
        const referenceId = `WD_${Date.now().toString().slice(-8)}`;
        const result = await (payos as any).payouts.create(
          {
            referenceId,
            amount: Number(withdrawal.amount),
            description: `XFOODI RUT TIEN`,
            toBin: withdrawal.bankBin,
            toAccountNumber: withdrawal.accountNumber,
          },
          referenceId,
        );
        externalTxId = result.id || result.referenceId || referenceId;
      }

      // Deduct balance
      const before = Number(withdrawal.wallet.balance);
      const after = before - Number(withdrawal.amount);

      await prisma.restaurantWallet.update({
        where: { id: withdrawal.walletId },
        data: { balance: { decrement: Number(withdrawal.amount) } },
      });

      // Record debit transaction
      await prisma.walletTransaction.create({
        data: {
          walletId: withdrawal.walletId,
          type: 'WITHDRAWAL_DEBIT',
          amount: Number(withdrawal.amount),
          balanceBefore: before,
          balanceAfter: after,
          description: `Rút tiền về tài khoản ${withdrawal.accountNumber}`,
          metadata: { withdrawalId, externalTxId },
        },
      });

      // Mark completed
      await prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: 'COMPLETED',
          externalTxId,
          processedAt: new Date(),
        },
      });

      return { success: true, externalTxId };
    } catch (err: any) {
      // Rollback to PENDING on failure so admin can retry
      await prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: 'FAILED', adminNote: err.message },
      });
      throw new Error(`Giải ngân thất bại: ${err.message}`);
    }
  }

  /**
   * [ADMIN] Reject withdrawal → no balance change needed (was never deducted).
   */
  async rejectWithdrawal(withdrawalId: string, reason: string) {
    const prisma = getPrisma();
    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal || withdrawal.status !== 'PENDING') {
      throw new Error('Không thể từ chối yêu cầu này');
    }

    await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: 'CANCELLED', rejectionReason: reason, processedAt: new Date() },
    });
  }
}

export const walletService = new WalletService();
