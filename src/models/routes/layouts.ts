import { Router, type Router as ExpressRouter } from 'express';
import { centralPrisma as prisma } from '../../lib/prisma';

const router: ExpressRouter = Router();

/**
 * AI Builder layout storage — backs the xfoodi-builder editor's Save/Publish.
 * Lives in the same Postgres DB as the rest of the platform (RestaurantLayouts table).
 */

// GET /api/layouts?tenantId=...
router.get('/', async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const layouts = await prisma.restaurantLayout.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json(layouts);
  } catch (error) {
    console.error('[Layouts API] List error:', error);
    return res.json([]);
  }
});

// GET /api/layouts/:id
router.get('/:id', async (req, res) => {
  try {
    const layout = await prisma.restaurantLayout.findUnique({ where: { id: req.params.id } });
    if (!layout) {
      return res.status(404).json({ error: 'Layout not found' });
    }
    return res.json(layout);
  } catch (error: any) {
    console.error('[Layouts API] Get error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// POST /api/layouts
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (!body.tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const layout = await prisma.restaurantLayout.create({
      data: {
        tenantId: body.tenantId,
        tenantHostname: body.tenantHostname,
        name: body.name,
        status: body.status || 'draft',
        version: body.version || 1,
        theme: body.theme,
        sections: body.sections,
        seo: body.seo,
        publishedAt: body.publishedAt || null,
      },
    });

    return res.json(layout);
  } catch (error: any) {
    console.error('[Layouts API] Create error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// PUT /api/layouts/:id
router.put('/:id', async (req, res) => {
  try {
    const { theme, sections, seo, name, status, version, publishedAt } = req.body;

    const layout = await prisma.restaurantLayout.update({
      where: { id: req.params.id },
      data: { theme, sections, seo, name, status, version, publishedAt },
    });

    return res.json({ success: true, ...layout });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Layout not found' });
    }
    console.error('[Layouts API] Update error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// POST /api/layouts/:id/publish
router.post('/:id/publish', async (req, res) => {
  try {
    const target = await prisma.restaurantLayout.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ error: 'Layout not found' });
    }

    await prisma.restaurantLayout.updateMany({
      where: { tenantId: target.tenantId, status: 'published' },
      data: { status: 'draft', publishedAt: null },
    });

    const published = await prisma.restaurantLayout.update({
      where: { id: req.params.id },
      data: { status: 'published', publishedAt: new Date() },
    });

    return res.json({ success: true, ...published });
  } catch (error: any) {
    console.error('[Layouts API] Publish error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// DELETE /api/layouts/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.restaurantLayout.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Layout not found' });
    }
    console.error('[Layouts API] Delete error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

export default router;
