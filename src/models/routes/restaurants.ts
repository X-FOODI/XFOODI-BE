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
 * ⚠️ PHẢI đứng trước /:slug để tránh bị match nhầm
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
        primaryColor: true,
        metadata: true,
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

/**
 * GET /api/restaurants/:slug
 * Public — trả về thông tin nhà hàng theo slug (không cần auth)
 * Dùng cho trang homepage của tenant: address, phone, email, lat/lng
 */
router.get('/:slug', async (req: any, res: any) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
        latitude: true,
        longitude: true,
        cuisineType: true,
        isActive: true,
      },
    });

    if (!restaurant || !restaurant.isActive) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    return res.json({ success: true, data: restaurant });
  } catch (err) {
    console.error('[RestaurantRoute] GET /:slug error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * PUT /api/restaurants/me
 * Update settings for the current user's restaurant
 */
router.put('/me', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId: string | undefined = req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(404).json({
        success: false,
        message: 'Bạn chưa có nhà hàng hoặc chưa được duyệt làm Owner.',
      });
    }

    const {
      name,
      description,
      address,
      phone,
      email,
      logoUrl,
      primaryColor,
      metadata, // expected to contain coverImage, operatingHours, socialLinks, gallery
    } = req.body;

    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(metadata !== undefined && { metadata }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        description: true,
        logoUrl: true,
        primaryColor: true,
        metadata: true,
      },
    });

    return res.json({
      success: true,
      data: updatedRestaurant,
    });
  } catch (err) {
    console.error('[RestaurantRoute] PUT /me error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật thông tin.',
    });
  }
});

export default router;
