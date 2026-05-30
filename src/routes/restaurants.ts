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
    let restaurantId: string | undefined = req.user?.restaurantId;

    if (!restaurantId) {
      // 1. Try to find an owned restaurant
      const ownedRest = await prisma.restaurant.findFirst({
        where: { ownerId: req.user?.sub ?? req.user?.id },
        select: { id: true },
      });
      if (ownedRest) {
        restaurantId = ownedRest.id;
      }
    }

    if (!restaurantId) {
      // 2. Try to find an employee association
      const employeeRest = await prisma.employee.findFirst({
        where: { userId: req.user?.sub ?? req.user?.id },
        select: { restaurantId: true },
      });
      if (employeeRest) {
        restaurantId = employeeRest.restaurantId;
      }
    }

    if (!restaurantId) {
      // 3. Fallback for testing/admin accounts: default to the first restaurant in the database
      const roles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
      if (roles.includes('Admin') || roles.includes('SuperAdmin') || roles.includes('Owner')) {
        const firstRest = await prisma.restaurant.findFirst({
          select: { id: true },
        });
        if (firstRest) {
          restaurantId = firstRest.id;
        }
      }
    }

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
