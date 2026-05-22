import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from './auth';

const router: ExpressRouter = Router();

/**
 * GET /api/restaurants/me
 * Trả về thông tin nhà hàng của Owner đang đăng nhập
 * Dùng restaurantId từ JWT payload
 */
router.get('/me', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId: string | undefined = req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(404).json({
        success: false,
        message: 'Bạn chưa có nhà hàng hoặc chưa được duyệt làm Owner.',
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        description: true,
        logoUrl: true,
        planType: true,
        isActive: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhà hàng.',
      });
    }

    return res.json({
      success: true,
      data: restaurant,
    });
  } catch (err) {
    console.error('[RestaurantRoute] GET /me error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server.',
    });
  }
});

export default router;
