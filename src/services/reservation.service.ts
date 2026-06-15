import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';
import { randomBytes } from 'crypto';
import { sendReservationReminderEmail } from '../lib/email';
import { generateReservationQR } from './qr.service';

function getPrisma(): PrismaClient {
  return prismaStorage.getStore() as PrismaClient;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING:    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:  ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED:  [],
  CANCELLED:  [],
};

function generateConfirmationCode(): string {
  return randomBytes(3).toString('hex').toUpperCase(); // e.g. "A1B2C3"
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateReservationDto {
  restaurantId: string;
  customerId: string;
  numberOfGuests: number;
  time: string; // ISO string
  specialRequests?: string;
  depositAmount?: number;
  tableIds?: string[];  // optional pre-select tables
}

export interface UpdateReservationDto {
  numberOfGuests?: number;
  time?: string;
  specialRequests?: string;
  tableIds?: string[];
}

export interface ReservationFilter {
  restaurantId: string;
  page?: number;
  limit?: number;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ReservationService {

  // GET status value by code
  private async getStatusByCode(code: string) {
    const prisma = getPrisma();
    return prisma.statusValue.findFirst({ where: { code } });
  }

  // Validate status transition against the allowed state machine
  validateTransition(from: string, to: string): void {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      const err: any = new Error(`Invalid transition from ${from} to ${to}`);
      err.statusCode = 422;
      err.body = { error: 'Invalid transition', from, to };
      throw err;
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  async createReservation(dto: CreateReservationDto) {
    const prisma = getPrisma();

    const pendingStatus = await this.getStatusByCode('PENDING');
    if (!pendingStatus) throw new Error('Status PENDING not configured');

    // Calculate deposit amount dynamically (25,000 VND per seat capacity of selected tables, or per guest if auto-arranged)
    let calculatedDeposit = 0;
    if (dto.tableIds && dto.tableIds.length > 0) {
      const tables = await prisma.table.findMany({
        where: { id: { in: dto.tableIds } },
        select: { seatingCapacity: true }
      });
      for (const t of tables) {
        calculatedDeposit += t.seatingCapacity * 25000;
      }
    } else {
      calculatedDeposit = dto.numberOfGuests * 25000;
    }

    // Generate unique confirmation code — max 10 attempts, HTTP 500 if exhausted
    let confirmationCode: string | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateConfirmationCode();
      const existing = await prisma.reservation.findUnique({ where: { confirmationCode: candidate } });
      if (!existing) { confirmationCode = candidate; break; }
    }
    if (!confirmationCode) {
      throw Object.assign(new Error('Unable to generate unique confirmation code. Please try again.'), { statusCode: 500 });
    }

    // Set paymentDeadline — 30 minutes from now if deposit > 0
    const paymentDeadline = calculatedDeposit > 0 ? new Date(Date.now() + 30 * 60 * 1000) : null;

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId: dto.restaurantId,
        customerId: dto.customerId,
        numberOfGuests: dto.numberOfGuests,
        time: new Date(dto.time),
        specialRequests: dto.specialRequests,
        depositAmount: calculatedDeposit,
        reservationStatusId: pendingStatus.id,
        confirmationCode,
        paymentDeadline,
        ...(dto.tableIds && dto.tableIds.length > 0
          ? {
              tables: {
                create: dto.tableIds.map((tableId) => ({ tableId })),
              },
            }
          : {}),
      },
      include: {
        tables: { include: { table: { select: { id: true, code: true, seatingCapacity: true } } } },
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        customer: {
          include: {
            user: { select: { id: true, fullName: true, email: true, phoneNumber: true, avatarUrl: true } },
          },
        },
      },
    });

    // Generate QR code — non-blocking, never throws
    let qrCodeUrl: string | null = null;
    try {
      qrCodeUrl = await generateReservationQR(confirmationCode);
    } catch (e) {
      console.error('[CreateReservation] QR generation failed:', e);
    }
    if (qrCodeUrl) {
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { metadata: { ...(reservation.metadata as any ?? {}), qrCodeUrl } }
      });
      (reservation as any).metadata = { ...(reservation.metadata as any ?? {}), qrCodeUrl };
    }

    // Send confirmation email — fire-and-forget, does not block response
    const customerEmail = reservation.customer?.user?.email;
    if (customerEmail) {
      import('../lib/email').then(({ sendReservationConfirmationEmail }) => {
        const restaurantPromise = prisma.restaurant.findUnique({ where: { id: dto.restaurantId }, select: { name: true } });
        restaurantPromise.then(rest => {
          sendReservationConfirmationEmail(customerEmail, {
            restaurantName: rest?.name ?? '',
            confirmationCode: confirmationCode!,
            numberOfGuests: dto.numberOfGuests,
            time: dto.time,
            depositAmount: calculatedDeposit,
            tableAssignments: reservation.tables.map((t: any) => t.table?.code).filter(Boolean),
          }, reservation.id).catch((e: any) => console.error('[CreateReservation] Email failed:', e?.message));
        });
      });
    }

    return reservation;
  }

  // ── List (staff/admin) ───────────────────────────────────────────────────────
  async listReservations(filter: ReservationFilter) {
    const prisma = getPrisma();
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { restaurantId: filter.restaurantId };

    if (filter.status) {
      const sv = await this.getStatusByCode(filter.status.toUpperCase());
      if (sv) where.reservationStatusId = sv.id;
    }

    if (filter.from || filter.to) {
      where.time = {};
      if (filter.from) where.time.gte = new Date(filter.from);
      if (filter.to) where.time.lte = new Date(filter.to);
    }

    if (filter.search) {
      where.OR = [
        { confirmationCode: { contains: filter.search, mode: 'insensitive' } },
        { customer: { user: { fullName: { contains: filter.search, mode: 'insensitive' } } } },
        { customer: { user: { phoneNumber: { contains: filter.search } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { time: 'asc' },
        include: {
          tables: { include: { table: { select: { id: true, code: true, seatingCapacity: true } } } },
          statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
          customer: {
            include: {
              user: { select: { id: true, fullName: true, email: true, phoneNumber: true, avatarUrl: true } },
            },
          },
        },
      }),
      prisma.reservation.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Get by ID ────────────────────────────────────────────────────────────────
  async getById(id: string) {
    const prisma = getPrisma();
    return prisma.reservation.findUnique({
      where: { id },
      include: {
        tables: { include: { table: { select: { id: true, code: true, seatingCapacity: true, floorId: true } } } },
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        customer: {
          include: {
            user: { select: { id: true, fullName: true, email: true, phoneNumber: true, avatarUrl: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { paymentMethod: true },
        },
        orders: { select: { id: true, reference: true, totalAmount: true } },
      },
    });
  }

  // ── Get by confirmation code ──────────────────────────────────────────────────
  async getByCode(code: string) {
    const prisma = getPrisma();
    return prisma.reservation.findUnique({
      where: { confirmationCode: code },
      include: {
        tables: { include: { table: { select: { id: true, code: true, seatingCapacity: true } } } },
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        customer: {
          include: {
            user: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
          },
        },
        payments: { include: { paymentMethod: true } },
      },
    });
  }

  // ── Update status ────────────────────────────────────────────────────────────
  async updateStatus(id: string, statusCode: string, actorId?: string) {
    const prisma = getPrisma();

    // Fetch current reservation with its status to validate transition
    const current = await prisma.reservation.findUnique({
      where: { id },
      include: { statusValue: { select: { code: true } } },
    });
    if (!current) throw new Error('Reservation not found');

    const currentStatusCode = current.statusValue?.code ?? '';
    const targetCode = statusCode.toUpperCase();

    this.validateTransition(currentStatusCode, targetCode);

    const status = await this.getStatusByCode(targetCode);
    if (!status) throw new Error(`Status ${statusCode} not found`);

    const now = new Date();

    // Append statusHistory entry to metadata
    const existingMeta: any = (current as any).metadata ?? {};
    const statusHistory: any[] = existingMeta.statusHistory ?? [];
    statusHistory.push({
      from: currentStatusCode,
      to: targetCode,
      at: now.toISOString(),
      by: actorId ?? 'SYSTEM',
    });

    const updateData: any = {
      reservationStatusId: status.id,
      metadata: { ...existingMeta, statusHistory },
    };

    // Set completedAt when transitioning to COMPLETED
    if (targetCode === 'COMPLETED') {
      updateData.completedAt = now;
    }

    return prisma.reservation.update({
      where: { id },
      data: updateData,
      include: {
        statusValue: true,
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
  }

  // ── Check-in ─────────────────────────────────────────────────────────────────
  async checkIn(code: string, actorId?: string) {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { confirmationCode: code },
      include: {
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        tables: { include: { table: { select: { id: true, code: true } } } },
      },
    });
    if (!reservation) {
      const err: any = new Error('Không tìm thấy đặt bàn');
      err.statusCode = 404;
      throw err;
    }

    const currentStatus = reservation.statusValue?.code ?? '';

    // Already checked in → 409
    if (currentStatus === 'CHECKED_IN') {
      const err: any = new Error('Khách đã check-in rồi');
      err.statusCode = 409;
      throw err;
    }

    // Not CONFIRMED → validate transition (will throw 422 if invalid)
    if (currentStatus !== 'CONFIRMED') {
      this.validateTransition(currentStatus, 'CHECKED_IN');
    }

    const checkedInStatus = await this.getStatusByCode('CHECKED_IN');
    if (!checkedInStatus) throw new Error('Status CHECKED_IN not configured');

    const now = new Date();

    // Build updated metadata with statusHistory appended
    const existingMeta: any = (reservation as any).metadata ?? {};
    const statusHistory: any[] = existingMeta.statusHistory ?? [];
    statusHistory.push({
      from: 'CONFIRMED',
      to: 'CHECKED_IN',
      at: now.toISOString(),
      by: actorId ?? 'SYSTEM',
    });

    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        checkedInAt: now,
        reservationStatusId: checkedInStatus.id,
        metadata: { ...existingMeta, statusHistory },
      },
      include: {
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        tables: { include: { table: { select: { id: true, code: true } } } },
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });

    // Fire-and-forget welcome email — does not block check-in response
    const customerEmail = (updated as any).customer?.user?.email;
    if (customerEmail) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: reservation.restaurantId },
        select: { name: true },
      }).catch(() => null);

      sendReservationReminderEmail(
        customerEmail,
        {
          restaurantName: restaurant?.name ?? '',
          confirmationCode: reservation.confirmationCode ?? '',
          numberOfGuests: reservation.numberOfGuests,
          time: reservation.time.toISOString(),
          depositAmount: Number(reservation.depositAmount ?? 0),
          tableAssignments: updated.tables.map((t: any) => t.table?.code).filter(Boolean),
        },
        reservation.id,
      ).catch((e: any) =>
        console.error('[CheckIn] Welcome email failed (non-blocking):', e?.message ?? e),
      );
    }

    return updated;
  }

  // ── Complete Reservation ────────────────────────────────────────────────────
  async completeReservation(id: string, actorId?: string) {
    const prisma = getPrisma();

    // Fetch current reservation including its status
    const current = await prisma.reservation.findUnique({
      where: { id },
      include: { statusValue: { select: { code: true } } },
    });
    if (!current) {
      const err: any = new Error('Reservation not found');
      err.statusCode = 404;
      throw err;
    }

    const currentStatusCode = current.statusValue?.code ?? '';

    // Validate transition: only CHECKED_IN → COMPLETED is allowed
    this.validateTransition(currentStatusCode, 'COMPLETED');

    const completedStatus = await this.getStatusByCode('COMPLETED');
    if (!completedStatus) throw new Error('Status COMPLETED not configured');

    const now = new Date();

    // Append statusHistory entry to metadata
    const existingMeta: any = (current as any).metadata ?? {};
    const statusHistory: any[] = existingMeta.statusHistory ?? [];
    statusHistory.push({
      from: currentStatusCode,
      to: 'COMPLETED',
      at: now.toISOString(),
      by: actorId ?? 'SYSTEM',
    });

    return prisma.reservation.update({
      where: { id },
      data: {
        completedAt: now,
        reservationStatusId: completedStatus.id,
        metadata: { ...existingMeta, statusHistory },
      },
      include: {
        statusValue: true,
        customer: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
  }

  // ── Update Reservation ───────────────────────────────────────────────────────
  async updateReservation(id: string, dto: UpdateReservationDto, actorId?: string) {
    const prisma = getPrisma();

    // 1. Fetch current reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        statusValue: { select: { id: true, code: true } },
        tables: { include: { table: { select: { id: true, seatingCapacity: true, code: true } } } },
      }
    });
    if (!reservation) throw Object.assign(new Error('Reservation not found'), { statusCode: 404 });

    // 2. Validate editable status
    const editableStatuses = ['PENDING', 'CONFIRMED'];
    if (!editableStatuses.includes(reservation.statusValue.code)) {
      throw Object.assign(
        new Error('Không thể chỉnh sửa reservation ở trạng thái hiện tại'),
        { statusCode: 422 }
      );
    }

    // 3. Validate fields present
    const hasFields = ['numberOfGuests', 'time', 'tableIds', 'specialRequests'].some(k => k in dto && (dto as any)[k] !== undefined);
    if (!hasFields) {
      throw Object.assign(new Error('No valid fields provided for update'), { statusCode: 400 });
    }

    // 4. Validate numberOfGuests bounds (1-50)
    if (dto.numberOfGuests !== undefined && (dto.numberOfGuests < 1 || dto.numberOfGuests > 50)) {
      throw Object.assign(new Error('numberOfGuests must be between 1 and 50'), { statusCode: 400 });
    }

    // 5. Validate time is in the future
    if (dto.time) {
      if (new Date(dto.time) <= new Date()) {
        throw Object.assign(new Error('Reservation time must be in the future'), { statusCode: 400 });
      }
    }

    // 6. Availability check if time or tableIds changed (±90 min buffer, exclude current reservation)
    if (dto.time || dto.tableIds !== undefined) {
      const checkTime = dto.time ?? reservation.time.toISOString();
      const targetTime = new Date(checkTime);
      const bufferBefore = new Date(targetTime.getTime() - 90 * 60 * 1000);
      const bufferAfter = new Date(targetTime.getTime() + 90 * 60 * 1000);

      if (dto.tableIds && dto.tableIds.length > 0) {
        // Check if requested tables are available (excluding this reservation)
        const conflicting = await prisma.reservationTable.findMany({
          where: {
            tableId: { in: dto.tableIds },
            reservationId: { not: id }, // exclude current
            reservation: {
              time: { gte: bufferBefore, lte: bufferAfter },
              statusValue: { code: { notIn: ['CANCELLED'] } },
            }
          },
          select: { reservationId: true }
        });
        if (conflicting.length > 0) {
          const conflictingIds = [...new Set(conflicting.map(c => c.reservationId))];
          throw Object.assign(
            new Error('Tables not available'),
            { statusCode: 409, body: { error: 'Tables not available', conflictingReservationIds: conflictingIds } }
          );
        }
      }
    }

    // 7. Recalculate depositAmount if numberOfGuests or tableIds changed
    const newTableIds = dto.tableIds;
    let newDepositAmount: number | undefined;
    if (dto.numberOfGuests !== undefined || newTableIds !== undefined) {
      const effectiveTableIds = newTableIds ?? reservation.tables.map(t => t.tableId ?? t.table.id);
      const effectiveGuests = dto.numberOfGuests ?? reservation.numberOfGuests;

      if (effectiveTableIds && effectiveTableIds.length > 0) {
        const tables = await prisma.table.findMany({
          where: { id: { in: effectiveTableIds } },
          select: { seatingCapacity: true }
        });
        newDepositAmount = tables.reduce((sum, t) => sum + t.seatingCapacity * 25000, 0);
      } else {
        newDepositAmount = effectiveGuests * 25000;
      }
    }

    // 8. Build update data
    const updateData: any = {};
    if (dto.numberOfGuests !== undefined) updateData.numberOfGuests = dto.numberOfGuests;
    if (dto.time) updateData.time = new Date(dto.time);
    if (dto.specialRequests !== undefined) updateData.specialRequests = dto.specialRequests;
    if (newDepositAmount !== undefined) updateData.depositAmount = newDepositAmount;

    // Handle table reassignment
    if (newTableIds !== undefined) {
      // Delete old table assignments, create new ones
      await prisma.reservationTable.deleteMany({ where: { reservationId: id } });
      if (newTableIds.length > 0) {
        await prisma.reservationTable.createMany({
          data: newTableIds.map(tableId => ({ reservationId: id, tableId }))
        });
      }
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: updateData,
      include: {
        tables: { include: { table: { select: { id: true, code: true, seatingCapacity: true } } } },
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        customer: { include: { user: { select: { id: true, fullName: true, email: true, phoneNumber: true } } } },
      }
    });

    // 9. Send modification email non-blocking
    const email = updated.customer?.user?.email;
    if (email) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: reservation.restaurantId }, select: { name: true } }).catch(() => null);
      import('../lib/email').then(({ sendReservationConfirmationEmail }) => {
        sendReservationConfirmationEmail(email, {
          restaurantName: restaurant?.name ?? '',
          confirmationCode: reservation.confirmationCode ?? '',
          numberOfGuests: updated.numberOfGuests,
          time: updated.time.toISOString(),
          depositAmount: Number(updated.depositAmount),
          tableAssignments: updated.tables.map(t => t.table.code),
        }, id).catch((e: any) => console.error('[UpdateReservation] Email failed:', e?.message));
      });
    }

    return updated;
  }

  // ── Cancel ───────────────────────────────────────────────────────────────────
  async cancel(id: string, actorId?: string) {
    const prisma = getPrisma();

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        statusValue: { select: { code: true } },
        payments: { where: { status: 1, purpose: 1 } }, // COMPLETED DEPOSIT payments
        restaurant: { select: { metadata: true } },
      }
    });
    if (!reservation) throw Object.assign(new Error('Reservation not found'), { statusCode: 404 });

    const cancelledStatus = await this.getStatusByCode('CANCELLED');
    if (!cancelledStatus) throw new Error('Status CANCELLED not configured');

    const now = new Date();
    const completedDeposits = reservation.payments;
    const totalDeposit = completedDeposits.reduce((sum, p) => sum + Number(p.amount), 0);

    // Build status history entry
    const existingMeta: any = (reservation as any).metadata ?? {};
    const statusHistory: any[] = existingMeta.statusHistory ?? [];
    statusHistory.push({
      from: reservation.statusValue?.code ?? '',
      to: 'CANCELLED',
      at: now.toISOString(),
      by: actorId ?? 'SYSTEM',
    });

    // Handle refund if deposit was paid
    let refundRecord: any = null;
    if (totalDeposit > 0 && completedDeposits.length > 0) {
      // Determine cancellation fee
      const restaurantMeta = (reservation.restaurant?.metadata as any) ?? {};
      const feePercent: number = restaurantMeta.cancellationFeePercent ?? 0;

      // Late cancellation rule: within 2 hours of reservation time → 100% fee
      const reservationTime = reservation.time;
      const twoHoursBefore = new Date(reservationTime.getTime() - 2 * 60 * 60 * 1000);
      const isLateCancellation = now >= twoHoursBefore;

      const effectiveFeePercent = isLateCancellation ? 100 : Math.min(100, Math.max(0, feePercent));
      const cancellationFee = Math.floor(totalDeposit * effectiveFeePercent / 100);
      const refundAmount = Math.max(0, totalDeposit - cancellationFee);

      // Create Refund record atomically before changing status
      try {
        refundRecord = await prisma.refund.create({
          data: {
            reservationId: id,
            amount: refundAmount,
            status: 'PENDING',
            metadata: isLateCancellation
              ? {
                  cancellation_timestamp: now.toISOString(),
                  fee_percentage: 100,
                  fee_reason: 'Late cancellation',
                }
              : feePercent > 0
              ? { fee_percentage: effectiveFeePercent }
              : {},
          }
        });
      } catch (refundErr: any) {
        console.error('[Cancel] Failed to create Refund record for reservation', id, ':', refundErr?.message);
        throw Object.assign(new Error('Internal error during refund creation'), { statusCode: 500 });
      }
    }

    // Update reservation status to CANCELLED
    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        reservationStatusId: cancelledStatus.id,
        metadata: { ...existingMeta, statusHistory },
      },
      include: {
        statusValue: true,
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        restaurant: { select: { name: true } },
      },
    });

    // Send refund/cancellation email non-blocking
    const customerEmail = updated.customer?.user?.email;
    if (customerEmail) {
      import('../lib/email').then(({ sendReservationCancellationEmail, sendRefundNotificationEmail }) => {
        const emailDetails = {
          restaurantName: (updated as any).restaurant?.name ?? '',
          confirmationCode: reservation.confirmationCode ?? '',
          numberOfGuests: reservation.numberOfGuests,
          time: reservation.time.toISOString(),
          depositAmount: totalDeposit,
          cancelledAt: now.toISOString(),
          refundAmount: refundRecord ? Number(refundRecord.amount) : undefined,
          refundEstimateDays: 7,
        };
        sendReservationCancellationEmail(customerEmail, emailDetails, id)
          .catch((e: any) => console.error('[Cancel] Cancellation email failed:', e?.message));

        if (refundRecord && Number(refundRecord.amount) > 0) {
          sendRefundNotificationEmail(customerEmail, {
            restaurantName: (updated as any).restaurant?.name ?? '',
            confirmationCode: reservation.confirmationCode ?? '',
            refundAmount: Number(refundRecord.amount),
            estimatedDays: 7,
          }, id).catch((e: any) => console.error('[Cancel] Refund email failed:', e?.message));
        }
      });
    }

    return updated;
  }

  // ── My reservations (customer) ───────────────────────────────────────────────
  async getMyReservations(customerId: string, restaurantId: string) {
    const prisma = getPrisma();
    return prisma.reservation.findMany({
      where: { customerId, restaurantId },
      orderBy: { time: 'desc' },
      take: 20,
      include: {
        tables: { include: { table: { select: { id: true, code: true } } } },
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        payments: { select: { id: true, amount: true, status: true } },
      },
    });
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  async getStats(restaurantId: string, period: 'today' | 'this_week' | 'this_month') {
    const prisma = getPrisma();

    // Validate period
    const validPeriods = ['today', 'this_week', 'this_month'];
    if (!validPeriods.includes(period)) {
      throw Object.assign(
        new Error('Invalid period. Accepted values: today, this_week, this_month'),
        { statusCode: 400 }
      );
    }

    // Validate restaurant exists
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) {
      throw Object.assign(new Error('Restaurant not found'), { statusCode: 404 });
    }

    // Calculate UTC+7 date boundaries
    // UTC+7 offset = 7 * 60 * 60 * 1000 = 25200000 ms
    const UTC7_OFFSET = 7 * 60 * 60 * 1000;
    const nowUTC = new Date();
    const nowUTC7 = new Date(nowUTC.getTime() + UTC7_OFFSET);

    let fromDate: Date;
    let toDate: Date;

    if (period === 'today') {
      // Today in UTC+7
      const y = nowUTC7.getUTCFullYear();
      const m = nowUTC7.getUTCMonth();
      const d = nowUTC7.getUTCDate();
      fromDate = new Date(Date.UTC(y, m, d, 0, 0, 0) - UTC7_OFFSET);
      toDate = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - UTC7_OFFSET);
    } else if (period === 'this_week') {
      // Monday to Sunday in UTC+7
      const dayOfWeek = nowUTC7.getUTCDay(); // 0=Sun, 1=Mon...
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(nowUTC7);
      monday.setUTCDate(nowUTC7.getUTCDate() - daysFromMonday);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      fromDate = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0) - UTC7_OFFSET);
      toDate = new Date(Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate(), 23, 59, 59, 999) - UTC7_OFFSET);
    } else {
      // this_month
      const y = nowUTC7.getUTCFullYear();
      const m = nowUTC7.getUTCMonth();
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      fromDate = new Date(Date.UTC(y, m, 1, 0, 0, 0) - UTC7_OFFSET);
      toDate = new Date(Date.UTC(y, m, lastDay, 23, 59, 59, 999) - UTC7_OFFSET);
    }

    // Get all reservations in period with their status
    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        time: { gte: fromDate, lte: toDate },
      },
      include: {
        statusValue: { select: { code: true } },
        payments: { where: { status: 1, purpose: 1 }, select: { amount: true } },
      }
    });

    let totalReservations = 0;
    let confirmedCount = 0;
    let checkedInCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let totalDepositCollected = 0;

    for (const r of reservations) {
      totalReservations++;
      const code = r.statusValue?.code ?? '';
      if (code === 'CONFIRMED' || code === 'CHECKED_IN') confirmedCount++;
      if (code === 'CHECKED_IN') checkedInCount++;
      if (code === 'COMPLETED') completedCount++;
      if (code === 'CANCELLED') cancelledCount++;
      for (const p of r.payments) {
        totalDepositCollected += Number(p.amount);
      }
    }

    const denom = totalReservations - cancelledCount;
    const checkInRate = denom === 0 ? 0.0 : Math.round((checkedInCount / denom) * 1000) / 10;

    return {
      totalReservations,
      confirmedCount,
      checkedInCount,
      completedCount,
      cancelledCount,
      checkInRate,
      totalDepositCollected,
    };
  }

  // ── Check available tables ───────────────────────────────────────────────────
  async checkAvailability(restaurantId: string, time: string, numberOfGuests: number) {
    const prisma = getPrisma();
    const targetTime = new Date(time);
    const bufferBefore = new Date(targetTime.getTime() - 90 * 60 * 1000); // -90 min
    const bufferAfter = new Date(targetTime.getTime() + 90 * 60 * 1000);  // +90 min

    // Find tables already reserved in that window
    const busyTableIds = (await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED'] } },
        },
      },
      select: { tableId: true },
    })).map((rt) => rt.tableId);

    // Available tables with enough seats
    const available = await prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
        seatingCapacity: { gte: numberOfGuests },
        id: { notIn: busyTableIds },
      },
      include: {
        floor: { select: { id: true, name: true } },
        tableStatus: { select: { id: true, code: true, name: true } },
      },
      orderBy: { seatingCapacity: 'asc' },
    });

    return available;
  }
}

export const reservationService = new ReservationService();
