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

    // Update balance and record the ledger entry atomically so the wallet
    // balance can never diverge from its transaction history.
    await prisma.$transaction(async (tx) => {
      await tx.restaurantWallet.update({
        where: { id: wallet.id },
        data: isCash
          ? {
              cashBalance: { increment: params.amount },
              lifetimeEarned: { increment: params.amount },
            }
          : {
              balance: { increment: params.amount },
              lifetimeEarned: { increment: params.amount },
            },
      });

      await tx.walletTransaction.create({
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

    if (dto.amount < 10000) {
      throw new Error('Số tiền rút tối thiểu là 10,000đ');
    }

    const wallet = await this.getOrCreateWallet(dto.restaurantId);

    // Re-read balance + pending withdrawals and create the new request inside a
    // single serializable transaction. Without this, two concurrent requests can
    // both pass the available-balance check and overdraw the wallet.
    const request = await prisma.$transaction(
      async (tx) => {
        const freshWallet = await tx.restaurantWallet.findUniqueOrThrow({
          where: { id: wallet.id },
        });

        const pending = await tx.withdrawalRequest.findMany({
          where: { walletId: wallet.id, status: { in: ['PENDING', 'PROCESSING'] } },
        });
        const locked = pending.reduce((s, w) => s + Number(w.amount), 0);
        const available = Number(freshWallet.balance) - locked;

        if (dto.amount > available) {
          throw new Error(
            `Số dư khả dụng không đủ. Khả dụng: ${available.toLocaleString('vi-VN')}đ`,
          );
        }

        return tx.withdrawalRequest.create({
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
      },
      { isolationLevel: 'Serializable' },
    );

    return request;
  }

  /**
   * [ADMIN] Get all withdrawal requests.
   */
  async listWithdrawals(filter: { status?: string; restaurantId?: string; page?: number; limit?: number }) {
    const prisma = getPrisma();
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.restaurantId) where.restaurantId = filter.restaurantId;

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

    // Track whether the external payout actually went through. If the payout
    // succeeded but the ledger update later fails, we must NOT mark the request
    // FAILED (that would imply no money moved) — leave it PROCESSING for manual
    // reconciliation instead.
    let payoutDone = false;

    try {
      // Try PayOS payout (external network call kept OUTSIDE the DB transaction
      // so we never hold row locks across a remote request).
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
      payoutDone = true;

      const before = Number(withdrawal.wallet.balance);
      const after = before - Number(withdrawal.amount);

      // Deduct balance, record the debit and mark completed atomically. The
      // balance is only ever touched AFTER the payout has succeeded.
      await prisma.$transaction(async (tx) => {
        await tx.restaurantWallet.update({
          where: { id: withdrawal.walletId },
          data: { balance: { decrement: Number(withdrawal.amount) } },
        });

        await tx.walletTransaction.create({
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

        await tx.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: {
            status: 'COMPLETED',
            externalTxId,
            processedAt: new Date(),
          },
        });
      });

      return { success: true, externalTxId };
    } catch (err: any) {
      if (payoutDone) {
        // Money already disbursed — keep PROCESSING and flag for reconciliation.
        await prisma.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: {
            adminNote: `PAYOUT_SENT_BUT_LEDGER_FAILED: ${err.message}`,
          },
        });
        throw new Error(
          `Đã giải ngân nhưng cập nhật sổ thất bại, cần đối soát thủ công: ${err.message}`,
        );
      }
      // Payout never happened — safe to mark FAILED so admin can retry.
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

  /**
   * Direct PayOS Payout (Bypass DB checks, for quick testing/withdraw)
   */
  async directPayout(params: { amount: number; bankBin: string; accountNumber: string; description?: string }) {
    const payos = getPayOS();
    if (!payos) throw new Error('PayOS is not configured in .env');

    const referenceId = `WD_DIRECT_${Date.now().toString().slice(-8)}`;
    const result = await (payos as any).payouts.create(
      {
        referenceId,
        amount: Math.floor(params.amount),
        description: (params.description || 'XFOODI RUT TIEN LE').slice(0, 50),
        toBin: params.bankBin,
        toAccountNumber: params.accountNumber,
      },
      referenceId,
    );

    return { result, referenceId };
  }
}

export const walletService = new WalletService();
