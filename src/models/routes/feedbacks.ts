import { Router, Response } from 'express';
import { feedbackService } from '../../services/feedback.service';
import { requireRole } from '../../middlewares/requireRole';
import { authMiddleware } from './auth';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env';

const router: Router = Router();

// ── Customer: submit feedback for an order (Guest & Logged-in support) ───────
router.post('/orders/:orderId', async (req: any, res: Response) => {
  try {
    const { prismaStorage } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    // Try to get userId if user is logged in
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded: any = jwt.verify(token, ENV.JWT.ACCESS_SECRET);
        userId = decoded.sub || decoded.id;
      } catch (err) {
        console.warn('Failed to verify token for feedback:', err);
      }
    }

    const order = await db.order.findUnique({
      where: { id: req.params.orderId },
      select: { id: true, customerId: true }
    });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let customerId: string;

    if (userId) {
      // Logged in user: get or create customer record
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
      customerId = customer.id;

      // Sync order customerId to logged-in customer if needed
      let shouldUpdateOrder = false;
      if (!order.customerId) {
        shouldUpdateOrder = true;
      } else if (order.customerId !== customerId) {
        const orderCustomer = await db.customer.findUnique({
          where: { id: order.customerId },
          select: { userId: true }
        });
        if (orderCustomer && !orderCustomer.userId) {
          shouldUpdateOrder = true;
        }
      }
      if (shouldUpdateOrder) {
        await db.order.update({
          where: { id: order.id },
          data: { customerId }
        });
      }
    } else {
      // Guest customer
      if (order.customerId) {
        customerId = order.customerId;
      } else {
        const guestCustomer = await db.customer.create({
          data: {
            loyaltyPoints: 0,
            isActive: true
          }
        });
        customerId = guestCustomer.id;
        await db.order.update({
          where: { id: order.id },
          data: { customerId }
        });
      }
    }

    const feedback = await feedbackService.create({
      orderId: req.params.orderId,
      customerId: customerId,
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
router.get('/', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
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
router.patch('/:id', authMiddleware, requireRole('Customer', 'Owner', 'Admin'), async (req: any, res: Response) => {
  try {
    const isAdmin = ['Owner', 'Admin'].some((r) => (req.user?.roles ?? []).includes(r));
    const feedback = await feedbackService.update(req.params.id, req.body, req.user.sub || req.user.id, isAdmin);
    return res.json({ success: true, data: feedback });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Toggle publish (staff/admin) ─────────────────────────────────────────────
router.patch('/:id/publish', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const { isPublished } = req.body;
    const feedback = await feedbackService.togglePublish(req.params.id, Boolean(isPublished));
    return res.json({ success: true, data: feedback });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, requireRole('Customer', 'Owner', 'Admin'), async (req: any, res: Response) => {
  try {
    const isAdmin = ['Owner', 'Admin'].some((r) => (req.user?.roles ?? []).includes(r));
    await feedbackService.delete(req.params.id, req.user.sub || req.user.id, isAdmin);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
