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

    const { prismaStorage, centralPrisma } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    let customerId: string;

    if (userId) {
      // 1. Fetch user from central DB and ensure they exist in tenant database
      const centralUser = await centralPrisma.user.findUnique({ where: { id: userId } });
      if (centralUser) {
        await db.user.upsert({
          where: { id: userId },
          update: {
            email: centralUser.email,
            userName: centralUser.userName,
            fullName: centralUser.fullName,
            phoneNumber: centralUser.phoneNumber,
            passwordHash: centralUser.passwordHash,
            isActive: centralUser.isActive,
            emailVerified: centralUser.emailVerified,
          },
          create: {
            id: centralUser.id,
            email: centralUser.email,
            userName: centralUser.userName,
            fullName: centralUser.fullName,
            phoneNumber: centralUser.phoneNumber,
            passwordHash: centralUser.passwordHash,
            isActive: centralUser.isActive,
            emailVerified: centralUser.emailVerified,
          }
        });
      }

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

    // Send pending confirmation email
    if (userEmail) {
       const { sendReservationPendingEmail } = await import('../../lib/email');
       sendReservationPendingEmail(userEmail, {
         restaurantName,
         numberOfGuests: reservation.numberOfGuests,
         time: reservation.time.toISOString(),
         depositAmount: typeof reservation.depositAmount === 'number'
           ? reservation.depositAmount
           : Number(reservation.depositAmount ?? 0),
         specialRequests: reservation.specialRequests || undefined,
       }, reservation.id).catch((e) => console.error('Failed to send reservation pending email:', e));
    }

    return res.status(201).json({ success: true, data: reservation });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Staff/Admin: list all reservations ──────────────────────────────────────
router.get('/', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req: any, res: Response) => {
  try {
    const { restaurantId, page, limit, status, from, to, search, sortBy, sortOrder } = req.query;
    const result = await reservationService.listReservations({
      restaurantId: restaurantId as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as string,
      from: from as string,
      to: to as string,
      search: search as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Customer: my reservations ────────────────────────────────────────────────
router.get('/my', authMiddleware, requireRole('Customer'), async (req: any, res: Response) => {
  try {
    const { prismaStorage, centralPrisma } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    const userId = req.user.sub || req.user.id;

    // Ensure the customer's User record exists in this tenant DB
    const centralUser = await centralPrisma.user.findUnique({ where: { id: userId } });
    if (centralUser) {
      await db.user.upsert({
        where: { id: userId },
        update: {
          email: centralUser.email,
          userName: centralUser.userName,
          fullName: centralUser.fullName,
          phoneNumber: centralUser.phoneNumber,
          passwordHash: centralUser.passwordHash,
          isActive: centralUser.isActive,
          emailVerified: centralUser.emailVerified,
        },
        create: {
          id: centralUser.id,
          email: centralUser.email,
          userName: centralUser.userName,
          fullName: centralUser.fullName,
          phoneNumber: centralUser.phoneNumber,
          passwordHash: centralUser.passwordHash,
          isActive: centralUser.isActive,
          emailVerified: centralUser.emailVerified,
        }
      });
    }

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

// ── Get all tables with availability status (for booking UI) ─────────────────
router.get('/tables-availability', async (req, res) => {
  try {
    const { restaurantId, time, numberOfGuests } = req.query;
    if (!restaurantId || !time || !numberOfGuests) {
      return res.status(400).json({ success: false, message: 'restaurantId, time and numberOfGuests required' });
    }
    const tables = await reservationService.getTablesWithAvailability(
      restaurantId as string,
      new Date(time as string),
      Number(numberOfGuests)
    );
    return res.json({ success: true, data: tables });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Check available slots for a day ──────────────────────────────────────────
router.get('/check-slots', async (req, res) => {
  try {
    const { restaurantId, date, numberOfGuests } = req.query;
    if (!restaurantId || !date || !numberOfGuests) {
      return res.status(400).json({ success: false, message: 'restaurantId, date and numberOfGuests required' });
    }
    const slots = await reservationService.checkAvailableSlots(
      restaurantId as string,
      date as string,
      Number(numberOfGuests)
    );
    return res.json({ success: true, data: slots });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Check double booking conflict ───────────────────────────────────────────
router.get('/check-conflict', async (req, res) => {
  try {
    const { restaurantId, time, email } = req.query;
    if (!restaurantId || !time) {
      return res.status(400).json({ success: false, message: 'restaurantId and time required' });
    }

    let customerId: string | null = null;
    const { prismaStorage } = await import('../../lib/prisma');
    const { PrismaClient } = await import('@prisma/client');
    const db = prismaStorage.getStore() as InstanceType<typeof PrismaClient>;

    // 1. Check if token is present
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const { ENV } = await import('../../config/env');
        const jwt = await import('jsonwebtoken');
        const decoded: any = jwt.default.verify(token, ENV.JWT.ACCESS_SECRET);
        const userId = decoded.sub || decoded.id;
        const customer = await db.customer.findFirst({ where: { userId } });
        if (customer) customerId = customer.id;
      } catch (e) {
        /* ignore invalid or expired token */
      }
    }

    // 2. Resolve customer by email if provided and not yet resolved
    if (!customerId && email) {
      const { resolveRestaurantFromHeaders } = await import('../../lib/tenant');
      const restaurant = await resolveRestaurantFromHeaders(req.headers);
      const normalizedEmail = (email as string).trim().toLowerCase();
      const scopedEmail = restaurant ? `${restaurant.slug}:${normalizedEmail}` : normalizedEmail;
      
      const userRec = await db.user.findFirst({ where: { email: scopedEmail } });
      if (userRec) {
        const customer = await db.customer.findFirst({ where: { userId: userRec.id } });
        if (customer) customerId = customer.id;
      }
    }

    if (!customerId) {
      return res.json({ success: true, conflict: false });
    }

    const targetTime = new Date(time as string);
    const hasConflict = await reservationService.hasDoubleBookingConflict(customerId, targetTime, restaurantId as string);

    return res.json({ success: true, conflict: hasConflict });
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

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req: any, res: Response) => {
  try {
    const { restaurantId, period } = req.query;
    if (!restaurantId) return res.status(400).json({ success: false, message: 'restaurantId required' });
    if (!period || !['today', 'this_week', 'this_month'].includes(period as string)) {
      return res.status(400).json({ success: false, message: 'Invalid period. Accepted values: today, this_week, this_month' });
    }
    const stats = await reservationService.getStats(restaurantId as string, period as 'today' | 'this_week' | 'this_month');
    return res.json({ success: true, data: stats });
  } catch (err: any) {
    return res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  }
});

// ── Update reservation ───────────────────────────────────────────────────────
router.patch('/:id', authMiddleware, requireRole('Owner', 'Admin', 'Staff', 'Customer'), async (req: any, res: Response) => {
  try {
    const actorId = req.user?.sub || req.user?.id;
    const updated = await reservationService.updateReservation(req.params.id, req.body, actorId);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 400;
    const body = err.body ?? { success: false, message: err.message };
    return res.status(statusCode).json({ success: false, ...body });
  }
});

// ── Complete reservation ─────────────────────────────────────────────────────
router.post('/:id/complete', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req: any, res: Response) => {
  try {
    const actorId = req.user?.sub || req.user?.id;
    const updated = await reservationService.completeReservation(req.params.id, actorId);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(err.statusCode ?? 400).json({ success: false, message: err.message });
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
    const { status, reason } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status required' });
    const actorId = (req as any).user?.sub || (req as any).user?.id;
    const updated = await reservationService.updateStatus(req.params.id, status, actorId, reason);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Check-in by code ─────────────────────────────────────────────────────────
router.post('/checkin/:code', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const actorId = (req as any).user?.sub || (req as any).user?.id;
    const updated = await reservationService.checkIn(req.params.code, actorId);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});



// ── Cancel ───────────────────────────────────────────────────────────────────
router.post('/:id/cancel', authMiddleware, requireRole('Owner', 'Admin', 'Staff', 'Customer'), async (req: any, res) => {
  try {
    const actorId = req.user?.sub || req.user?.id;
    const isStaff = ['Owner', 'Admin', 'Staff'].includes(req.user?.role);
    const { approveReview, reason, bankRefund } = req.body;
    // Security: Only staff/owner can pass approveReview parameter
    const effectiveApproveReview = isStaff ? approveReview : undefined;
    const updated = await reservationService.cancel(req.params.id, actorId, isStaff, effectiveApproveReview, reason, bankRefund);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Resolve No Show ──────────────────────────────────────────────────────────
router.post('/:id/resolve-noshow', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const updated = await reservationService.resolveNoShow(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
