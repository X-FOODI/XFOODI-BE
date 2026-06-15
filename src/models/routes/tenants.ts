import { Router, type Router as ExpressRouter } from 'express';
import { prisma } from '../../lib/prisma';

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

export default router;
