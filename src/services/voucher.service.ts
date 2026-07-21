import { prisma, centralPrisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export class VoucherService {
  /**
   * Create a voucher in the database.
   */
  async createVoucher(
    restaurantId: string | null,
    data: {
      code: string;
      title: string;
      description?: string;
      discountValue: number;
      discountType: string;
      pointsRequired: number;
      expiryDate: Date;
      quantity: number;
      applicableService?: 'booking' | 'shop' | 'all';
      distributionMode?: 'public' | 'private';
      status?: string;
      isActive?: boolean;
    }
  ) {
    const codeUpper = data.code.trim().toUpperCase();

    // Check for duplicate voucher code within the same restaurant (or globally for platform vouchers)
    const existing = await prisma.voucher.findFirst({
      where: {
        code: codeUpper,
        restaurantId: restaurantId || null,
      },
    });

    if (existing) {
      throw new Error(
        restaurantId
          ? 'Mã voucher này đã tồn tại trong nhà hàng.'
          : 'Mã voucher toàn sàn này đã tồn tại.'
      );
    }

    return prisma.voucher.create({
      data: {
        restaurantId: restaurantId || null,
        code: codeUpper,
        title: data.title.trim(),
        description: data.description ? data.description.trim() : null,
        discountValue: new Prisma.Decimal(data.discountValue),
        discountType: data.discountType,
        pointsRequired: data.pointsRequired,
        expiryDate: new Date(data.expiryDate),
        quantity: data.quantity,
        applicableService: data.applicableService || 'all',
        distributionMode: data.distributionMode || 'public',
        status: data.status || 'active',
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  /**
   * Get all active and eligible vouchers for customers.
   */
  async getEligibleVouchers(restaurantId?: string) {
    const now = new Date();

    // Platform vouchers: restaurantId is null, status is active, expiryDate is future, quantity > 0
    const platformVouchers = await prisma.voucher.findMany({
      where: {
        restaurantId: null,
        status: 'active',
        isActive: true,
        expiryDate: {
          gt: now,
        },
        quantity: {
          gt: 0,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Owner vouchers: restaurantId is not null, status is active, expiryDate is future, quantity > 0
    const ownerVouchers = await prisma.voucher.findMany({
      where: {
        restaurantId: restaurantId ? restaurantId : { not: null },
        status: 'active',
        isActive: true,
        expiryDate: {
          gt: now,
        },
        quantity: {
          gt: 0,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      platformVouchers,
      ownerVouchers,
    };
  }

  /**
   * Get all vouchers belonging to a specific restaurant.
   */
  async getVouchersByRestaurant(restaurantId: string) {
    return prisma.voucher.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Legacy method: List vouchers for backwards compatibility.
   */
  async listVouchers(restaurantId: string, filters?: { isActive?: boolean }) {
    const whereClause: any = { restaurantId };
    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    return prisma.voucher.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Legacy method: Update voucher settings.
   */
  async updateVoucher(
    restaurantId: string | null,
    id: string,
    data: {
      code?: string;
      title?: string;
      description?: string;
      discountValue?: number;
      discountType?: string;
      pointsRequired?: number;
      expiryDate?: Date;
      quantity?: number;
      applicableService?: 'booking' | 'shop' | 'all';
      distributionMode?: 'public' | 'private';
      status?: string;
      isActive?: boolean;
    }
  ) {
    const voucher = await prisma.voucher.findFirst({
      where: { id, restaurantId: restaurantId || null },
    });

    if (!voucher) {
      throw new Error('Không tìm thấy voucher.');
    }

    if (data.code && data.code.trim().toUpperCase() !== voucher.code) {
      const existing = await prisma.voucher.findFirst({
        where: {
          code: data.code.trim().toUpperCase(),
          restaurantId: restaurantId || null,
          id: { not: id },
        },
      });
      if (existing) {
        throw new Error('Mã voucher này đã tồn tại.');
      }
    }

    return prisma.voucher.update({
      where: { id },
      data: {
        ...(data.code && { code: data.code.trim().toUpperCase() }),
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.discountValue !== undefined && { discountValue: new Prisma.Decimal(data.discountValue) }),
        ...(data.discountType && { discountType: data.discountType }),
        ...(data.pointsRequired !== undefined && { pointsRequired: data.pointsRequired }),
        ...(data.expiryDate && { expiryDate: new Date(data.expiryDate) }),
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.applicableService && { applicableService: data.applicableService }),
        ...(data.distributionMode && { distributionMode: data.distributionMode }),
        ...(data.status && { status: data.status }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /**
   * Legacy method: Delete voucher.
   */
  async deleteVoucher(restaurantId: string | null, id: string) {
    const voucher = await prisma.voucher.findFirst({
      where: { id, restaurantId: restaurantId || null },
    });

    if (!voucher) {
      throw new Error('Không tìm thấy voucher.');
    }

    return prisma.voucher.delete({
      where: { id },
    });
  }

  /**
   * Redeem a voucher using customer's loyalty points.
   */
  async redeemVoucher(userId: string, voucherId: string) {
    const voucher = await prisma.voucher.findUnique({
      where: { id: voucherId },
    });

    if (!voucher) {
      throw new Error('Voucher không tồn tại hoặc đã bị xóa.');
    }

    if (!voucher.isActive || voucher.status !== 'active') {
      throw new Error('Voucher hiện tại đang không hoạt động.');
    }

    if (voucher.quantity <= 0) {
      throw new Error('Voucher đã hết số lượng phát hành.');
    }

    if (new Date(voucher.expiryDate) < new Date()) {
      throw new Error('Voucher đã hết hạn sử dụng.');
    }

    const restaurantId = voucher.restaurantId;
    if (!restaurantId) {
      throw new Error('Không thể đổi điểm cho voucher toàn sàn qua điểm của nhà hàng.');
    }

    let customer = await prisma.customer.findFirst({
      where: { userId },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          userId,
          loyaltyPoints: 0,
          isActive: true,
        },
      });
    }

    const userPoints = await centralPrisma.userLoyaltyPoint.findUnique({
      where: {
        userId_restaurantId: { userId, restaurantId },
      },
    });

    const currentPoints = userPoints?.points || 0;
    if (currentPoints < voucher.pointsRequired) {
      throw new Error(
        `Bạn không đủ điểm để đổi voucher này. Cần ${voucher.pointsRequired} điểm, bạn đang có ${currentPoints} điểm.`
      );
    }

    // Thực hiện tất cả thao tác trong centralPrisma.$transaction vì Voucher,
    // UserVoucher và UserLoyaltyPoint đều nằm trong Central DB (public schema).
    // Customer và PointsTransaction nằm trong Tenant DB nên xử lý riêng.
    const userVoucher = await centralPrisma.$transaction(async (ctx) => {
      const innerVoucher = await ctx.voucher.findUnique({
        where: { id: voucherId },
      });

      if (!innerVoucher || innerVoucher.quantity <= 0 || !innerVoucher.isActive || innerVoucher.status !== 'active') {
        throw new Error('Voucher vừa hết số lượng hoặc đã bị vô hiệu hóa.');
      }

      await ctx.voucher.update({
        where: { id: voucherId },
        data: { quantity: { decrement: 1 } },
      });

      await ctx.userLoyaltyPoint.upsert({
        where: {
          userId_restaurantId: { userId, restaurantId },
        },
        // Nếu bản ghi chưa tồn tại thì tạo mới rồi trừ điểm
        // (thực ra sẽ dẫn đến âm — nhưng bước check currentPoints < pointsRequired
        //  phía trên đã chặn trước khi vào $transaction này)
        create: {
          userId,
          restaurantId,
          points: -voucher.pointsRequired,
        },
        update: {
          points: { decrement: voucher.pointsRequired },
        },
      });

      return ctx.userVoucher.create({
        data: {
          userId,
          voucherId,
          isUsed: false,
        },
        include: {
          voucher: true,
        },
      });
    });

    // Cập nhật tenant DB (Customer loyalty cache + PointsTransaction log) riêng biệt
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer!.id },
        data: {
          loyaltyPoints: { decrement: voucher.pointsRequired },
        },
      });

      await tx.pointsTransaction.create({
        data: {
          customerId: customer!.id,
          points: -voucher.pointsRequired,
          type: 'REDEEM',
          description: `Đổi voucher ${voucher.code}`,
        },
      });
    });

    return userVoucher;
  }

  async getUserVouchers(userId: string, restaurantId?: string, onlyUnused: boolean = false) {
    const whereClause: any = { userId };
    if (onlyUnused) {
      whereClause.isUsed = false;
    }

    const voucherFilters: any = {};
    if (onlyUnused) {
      voucherFilters.isActive = true;
      voucherFilters.status = 'active';
      voucherFilters.expiryDate = {
        gt: new Date(),
      };
    }

    if (restaurantId) {
      voucherFilters.OR = [
        { restaurantId: restaurantId },
        { restaurantId: null },
      ];
    }

    if (Object.keys(voucherFilters).length > 0) {
      whereClause.voucher = voucherFilters;
    }

    return prisma.userVoucher.findMany({
      where: whereClause,
      include: {
        voucher: true,
      },
      orderBy: { redeemedAt: 'desc' },
    });
  }
}

export const voucherService = new VoucherService();
