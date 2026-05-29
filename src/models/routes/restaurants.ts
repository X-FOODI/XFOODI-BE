import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';

const router: ExpressRouter = Router();

/**
 * GET /api/restaurants
 * Public — trả về danh sách nhà hàng đang hoạt động để hiển thị trên homepage
 */
router.get('/', async (_req: any, res: any) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
        planType: true,
        latitude: true,
        longitude: true,
        cuisineType: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      data: restaurants,
    });
  } catch (err) {
    console.error('[RestaurantRoute] GET / error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * GET /api/restaurants/me
 * Trả về thông tin nhà hàng của Owner đang đăng nhập
 * Dùng restaurantId từ JWT payload
 */
router.get('/me', authMiddleware, tenantGuard, async (req: any, res: any) => {
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
