import { prisma, centralPrisma } from '../lib/prisma';

export class LoyaltyService {
  /**
   * Calculate loyalty points earned from an order and credit them to the user.
   * This is run in the context of the active tenant schema.
   */
  async calculateAndRewardPoints(orderId: string): Promise<void> {
    // 1. Fetch order details
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order || !order.customerId || !order.customer?.userId) {
      console.log(`[LoyaltyService] Order ${orderId} does not have a registered customer. Skipping points reward.`);
      return;
    }

    const userId = order.customer.userId as string;
    const restaurantId = order.restaurantId as string;

    // 2. Check if points have already been credited for this order to prevent double-crediting
    const existingTx = await prisma.pointsTransaction.findFirst({
      where: {
        orderId,
        type: 'EARN',
      },
    });

    if (existingTx) {
      console.log(`[LoyaltyService] Points already credited for order ${orderId}. Skipping.`);
      return;
    }

    // 3. Get restaurant config from central DB
    const restaurant = await centralPrisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { loyaltyPointRate: true, name: true, slug: true },
    });

    const rate = restaurant?.loyaltyPointRate || 10000;
    const totalAmount = Number(order.totalAmount);

    const pointsToEarn = Math.floor(totalAmount / rate);
    if (pointsToEarn <= 0) {
      console.log(`[LoyaltyService] Order total (${totalAmount} VNĐ) is less than rate (${rate} VNĐ). 0 points earned.`);
      return;
    }

    // 4. Update central loyalty points
    await centralPrisma.userLoyaltyPoint.upsert({
      where: {
        userId_restaurantId: { userId, restaurantId },
      },
      update: {
        points: { increment: pointsToEarn },
      },
      create: {
        userId,
        restaurantId,
        points: pointsToEarn,
      },
    });

    // 5. Update tenant Customer loyaltyPoints
    await prisma.customer.update({
      where: { id: order.customerId },
      data: {
        loyaltyPoints: { increment: pointsToEarn },
      },
    });

    // 6. Record transaction in tenant DB
    await prisma.pointsTransaction.create({
      data: {
        customerId: order.customerId,
        points: pointsToEarn,
        type: 'EARN',
        orderId,
        description: `Tích điểm từ đơn hàng ${order.reference}`,
      },
    });

    console.log(`[LoyaltyService] Successfully rewarded ${pointsToEarn} points to user ${userId} for order ${order.reference}`);
  }

  /**
   * Get user loyalty points across all restaurants.
   */
  async getUserLoyaltyPoints(userId: string) {
    const points = await centralPrisma.userLoyaltyPoint.findMany({
      where: { userId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            slug: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return points.map((p) => ({
      id: p.id,
      restaurantId: p.restaurantId,
      restaurantName: p.restaurant.name,
      restaurantLogo: p.restaurant.logoUrl ?? undefined,
      restaurantSlug: p.restaurant.slug,
      points: p.points,
      updatedAt: p.updatedAt,
    }));
  }
}

export const loyaltyService = new LoyaltyService();
