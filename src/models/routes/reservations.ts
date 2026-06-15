import { Router, Request, Response } from 'express';
import { reservationService } from '../../services/reservation.service';
import { requireRole } from '../../middlewares/requireRole';
import { authMiddleware } from './auth';

const router: Router = Router();

// ── Customer: create reservation (supports guests) ─────────────────────────────
router.post('/', async (req: any, res: Response) => {
  try {
    let userId: string | null = null;
    let userEmail: string | null = null;

    // Check if user is logged in
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const { ENV } = await import('../../config/env');
        const jwt = await import('jsonwebtoken');
        const decoded: any = jwt.default.verify(token, ENV.JWT.ACCESS_SECRET);
        userId = decoded.sub || decoded.id;
        userEmail = decoded.email || decoded.unique_name;
      } catch (err) {
        // Token invalid/expired, proceed as guest
      }
    }

    const { prismaStorage } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    let customerId: string;

    if (userId) {
      // Logged-in user
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
      if (!userEmail) {
        const userRec = await db.user.findUnique({ where: { id: userId } });
        userEmail = userRec?.email || null;
      }
    } else {
      // Guest user booking
      const { email, fullName, phoneNumber } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ success: false, message: 'Email là bắt buộc khi đặt bàn với tư cách khách.' });
      }

      const { resolveRestaurantFromHeaders } = await import('../../lib/tenant');
      const restaurant = await resolveRestaurantFromHeaders(req.headers);
      const normalizedEmail = email.trim().toLowerCase();
      const scopedEmail = restaurant ? `${restaurant.slug}:${normalizedEmail}` : normalizedEmail;

      // Find user
      let userRec = await db.user.findFirst({ where: { email: scopedEmail } });
      if (!userRec) {
        // Create guest user
        userRec = await db.user.create({
          data: {
            email: scopedEmail,
            userName: scopedEmail,
            fullName: fullName || 'Khách vãng lai',
            phoneNumber: phoneNumber || null,
            provider: 'guest',
            emailVerified: true,
            isActive: true
          }
        });
      }

      // Find or create customer
      let customer = await db.customer.findFirst({ where: { userId: userRec.id } });
      if (!customer) {
        customer = await db.customer.create({
          data: {
            userId: userRec.id,
            loyaltyPoints: 0,
            isActive: true
          }
        });
      }
      customerId = customer.id;
      userEmail = scopedEmail;
    }

    const dto = {
      ...req.body,
      customerId,
    };

    const reservation = await reservationService.createReservation(dto);

    // Fetch restaurant name
    const restaurantRec = await db.restaurant.findUnique({
      where: { id: reservation.restaurantId },
      select: { name: true }
    });
    const restaurantName = restaurantRec?.name || 'XFoodi Restaurant';

    // Send confirmation email
    if (userEmail) {
      const { sendReservationConfirmationEmail } = await import('../../lib/email');
      sendReservationConfirmationEmail(userEmail, {
        restaurantName,
        confirmationCode: reservation.confirmationCode || '',
        numberOfGuests: reservation.numberOfGuests,
        time: reservation.time.toISOString(),
        specialRequests: reservation.specialRequests || undefined,
      }).catch((e) => console.error('Failed to send reservation confirmation email:', e));
    }

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
