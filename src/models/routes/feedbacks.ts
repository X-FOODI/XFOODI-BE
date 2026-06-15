import { Router, Response } from 'express';
import { feedbackService } from '../../services/feedback.service';
import { requireRole } from '../../middlewares/requireRole';

const router: Router = Router();

// ── Customer: submit feedback for an order ───────────────────────────────────
router.post('/orders/:orderId', requireRole('Customer', 'Owner', 'Admin'), async (req: any, res: Response) => {
  try {
    const { prismaStorage } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    const userId = req.user.sub || req.user.id;
    let customer = await db.customer.findFirst({ where: { userId } });
    if (!customer) {
      customer = await db.customer.create({
        data: {
          userId,
          loyaltyPoints: 0,
          isActive: true
        }
      });
    }

    const feedback = await feedbackService.create({
      orderId: req.params.orderId,
      customerId: customer.id,
      rating: Number(req.body.rating),
      comment: req.body.comment,
      isAnonymous: req.body.isAnonymous === true || req.body.isAnonymous === 'true',
      imageUrls: req.body.imageUrls,
    });

    return res.status(201).json({ success: true, data: feedback });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Get feedback by order ID (customer or staff) ─────────────────────────────
router.get('/orders/:orderId', async (req, res) => {
  try {
    const feedback = await feedbackService.getByOrderId(req.params.orderId);
    return res.json({ success: true, data: feedback ?? null });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── List feedbacks (staff/admin) ─────────────────────────────────────────────
router.get('/', requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const { restaurantId, page, limit, minRating, maxRating, isPublished, search } = req.query;
    const result = await feedbackService.list({
      restaurantId: restaurantId as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      minRating: minRating ? Number(minRating) : undefined,
      maxRating: maxRating ? Number(maxRating) : undefined,
      isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
      search: search as string,
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get by ID ────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const feedback = await feedbackService.getById(req.params.id);
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found' });
    return res.json({ success: true, data: feedback });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Update (customer edits own / admin publishes) ────────────────────────────
router.patch('/:id', requireRole('Customer', 'Owner', 'Admin'), async (req: any, res: Response) => {
  try {
    const isAdmin = ['Owner', 'Admin'].some((r) => (req.user?.roles ?? []).includes(r));
    const feedback = await feedbackService.update(req.params.id, req.body, req.user.sub || req.user.id, isAdmin);
    return res.json({ success: true, data: feedback });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Toggle publish (staff/admin) ─────────────────────────────────────────────
router.patch('/:id/publish', requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const { isPublished } = req.body;
    const feedback = await feedbackService.togglePublish(req.params.id, Boolean(isPublished));
    return res.json({ success: true, data: feedback });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole('Customer', 'Owner', 'Admin'), async (req: any, res: Response) => {
  try {
    const isAdmin = ['Owner', 'Admin'].some((r) => (req.user?.roles ?? []).includes(r));
    await feedbackService.delete(req.params.id, req.user.sub || req.user.id, isAdmin);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
