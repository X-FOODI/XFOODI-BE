import { Router, Request, Response } from 'express';
import { reservationService } from '../../services/reservation.service';
import { requireRole } from '../../middlewares/requireRole';
import { authMiddleware } from './auth';

const router = Router();

// ── Customer: create reservation ─────────────────────────────────────────────
router.post('/', authMiddleware, requireRole('Customer', 'Owner', 'Admin'), async (req: any, res: Response) => {
  try {
    const user = req.user;
    const prisma = (req as any).prismaClient ?? (await import('../../lib/prisma')).prismaStorage.getStore();

    // Resolve customerId from the logged-in user
    const { PrismaClient } = await import('@prisma/client');
    const { prismaStorage } = await import('../../lib/prisma');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    let customer = await db.customer.findFirst({ where: { userId: user.id } });
    if (!customer) {
      customer = await db.customer.create({
        data: {
          userId: user.id,
          loyaltyPoints: 0,
          isActive: true
        }
      });
    }

    const dto = {
      ...req.body,
      customerId: customer.id,
    };

    const reservation = await reservationService.createReservation(dto);
    return res.status(201).json({ success: true, data: reservation });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Staff/Admin: list all reservations ──────────────────────────────────────
router.get('/', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req: any, res: Response) => {
  try {
    const { restaurantId, page, limit, status, from, to, search } = req.query;
    const result = await reservationService.listReservations({
      restaurantId: restaurantId as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as string,
      from: from as string,
      to: to as string,
      search: search as string,
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Customer: my reservations ────────────────────────────────────────────────
router.get('/my', authMiddleware, requireRole('Customer'), async (req: any, res: Response) => {
  try {
    const { prismaStorage } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    let customer = await db.customer.findFirst({ where: { userId: req.user.id } });
    if (!customer) {
      customer = await db.customer.create({
        data: {
          userId: req.user.id,
          loyaltyPoints: 0,
          isActive: true
        }
      });
    }

    const { restaurantId } = req.query;
    const reservations = await reservationService.getMyReservations(customer.id, restaurantId as string);
    return res.json({ success: true, data: reservations });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Check available tables ───────────────────────────────────────────────────
router.get('/check-tables', async (req, res) => {
  try {
    const { restaurantId, time, numberOfGuests } = req.query;
    if (!restaurantId || !time || !numberOfGuests) {
      return res.status(400).json({ success: false, message: 'restaurantId, time and numberOfGuests required' });
    }
    const tables = await reservationService.checkAvailability(
      restaurantId as string,
      time as string,
      Number(numberOfGuests),
    );
    return res.json({ success: true, data: tables });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get by confirmation code ─────────────────────────────────────────────────
router.get('/code/:code', async (req, res) => {
  try {
    const reservation = await reservationService.getByCode(req.params.code);
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });
    return res.json({ success: true, data: reservation });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get by ID ────────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, requireRole('Owner', 'Admin', 'Staff', 'Customer'), async (req, res) => {
  try {
    const reservation = await reservationService.getById(req.params.id);
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });
    return res.json({ success: true, data: reservation });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Update status ────────────────────────────────────────────────────────────
router.patch('/:id/status', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status required' });
    const updated = await reservationService.updateStatus(req.params.id, status);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Check-in by code ─────────────────────────────────────────────────────────
router.post('/checkin/:code', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const updated = await reservationService.checkIn(req.params.code);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Cancel ───────────────────────────────────────────────────────────────────
router.post('/:id/cancel', authMiddleware, requireRole('Owner', 'Admin', 'Staff', 'Customer'), async (req, res) => {
  try {
    const updated = await reservationService.cancel(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
