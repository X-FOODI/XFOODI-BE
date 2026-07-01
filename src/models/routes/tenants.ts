import { Router, type Router as ExpressRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from './auth';
import { requireRole } from '../../middlewares/requireRole';

const router: ExpressRouter = Router();

// GET /api/tenants - List all active restaurants
router.get('/', async (req, res) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        isActive: true,
      },
    });
    res.json(restaurants);
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/tenants/:domain - Get restaurant by slug/domain
router.get('/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const BASE_DOMAIN = 'xfoodi.website';
    let slug = domain.trim().toLowerCase();

    if (slug.endsWith('.localhost')) {
      slug = slug.replace(/\.localhost$/, '');
    } else if (slug.endsWith(`.${BASE_DOMAIN}`)) {
      slug = slug.replace(new RegExp(`\\.${BASE_DOMAIN}$`), '');
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { id: domain },
          { slug: slug },
          { slug: domain },
        ],
        isActive: true,
      },
    });

    if (!restaurant) {
      // Return a default/demo response for development
      return res.json({
        id: 'demo',
        name: 'Demo Restaurant',
        slug: domain,
        hostname: domain,
        businessName: 'Demo Restaurant',
        logoUrl: null,
        primaryColor: '#FF380B',
        status: true,
        isActive: true,
      });
    }

    res.json({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      hostname: restaurant.slug,
      businessName: restaurant.name,
      logoUrl: restaurant.logoUrl,
      primaryColor: restaurant.primaryColor,
      description: restaurant.description,
      address: restaurant.address,
      phone: restaurant.phone,
      email: restaurant.email,
      status: restaurant.isActive,
      isActive: restaurant.isActive,
      metadata: restaurant.metadata,
    });
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/tenants/:id/business-hours - placeholder
router.get('/:id/business-hours', (req, res) => {
  const hours = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    openTime: '09:00:00',
    closeTime: '22:00:00',
    isClosed: false,
  }));
  res.json(hours);
});

// GET /api/tenants/:id/payment-settings
router.get('/:id/payment-settings', (req, res) => {
  res.status(404).json({ success: false, message: 'Payment settings not configured' });
});

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

// GET /api/tenants/admin/list - List all restaurants (Active & Inactive) with pagination
router.get('/admin/list', authMiddleware, requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { page = '1', limit = '10', search = '' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        skip,
        take: parseInt(limit as string),
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
          isActive: true,
          createdAt: true,
          owner: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      prisma.restaurant.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        items: restaurants,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('[TenantsRoute] Admin List error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/tenants/:id/status - Toggle active/inactive status
router.patch('/:id/status', authMiddleware, requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    const updated = await prisma.restaurant.update({
      where: { id },
      data: { isActive },
    });

    return res.json({
      success: true,
      message: isActive ? 'Nhà hàng đã được kích hoạt' : 'Nhà hàng đã bị khóa',
      data: {
        id: updated.id,
        isActive: updated.isActive,
      }
    });
  } catch (error) {
    console.error('[TenantsRoute] Patch status error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
