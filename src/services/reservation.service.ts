import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';
import { randomBytes } from 'crypto';
import { sendReservationReminderEmail } from '../lib/email';
import { generateReservationQR } from './qr.service';

// PayOS payout helper (reuses env vars already set for wallet service)
function getPayOS(): any | null {
  const clientId = process.env.PAYOS_CLIENT_ID?.trim();
  const apiKey = process.env.PAYOS_API_KEY?.trim();
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim();
  if (!clientId || !apiKey || !checksumKey) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PayOS } = require('@payos/node');
    return new PayOS({ clientId, apiKey, checksumKey });
  } catch { return null; }
}

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
  bankRefund?: {         // bank account to auto-payout refund if cancelled
    bankBin: string;
    bankCode: string;
    bankName?: string;
    accountNumber: string;
    accountName: string;
  };
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

    // Fetch restaurant metadata
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      select: { id: true, metadata: true }
    });
    if (!restaurant) {
      throw Object.assign(new Error('Không tìm thấy thông tin nhà hàng'), { statusCode: 404 });
    }
    const metadata = (restaurant.metadata as any) ?? {};
    const config = metadata.reservationConfig ?? {};

    // 1. Validate number of guests
    if (!dto.numberOfGuests || dto.numberOfGuests <= 0) {
      throw Object.assign(new Error('Số lượng khách phải lớn hơn 0'), { statusCode: 400 });
    }
    if (dto.numberOfGuests > 100) {
      throw Object.assign(new Error('Nhà hàng chỉ nhận đặt bàn trực tuyến cho tối đa 100 khách. Vui lòng liên hệ trực tiếp.'), { statusCode: 400 });
    }

    // 2. Validate time limits
    const isAuto = !dto.tableIds || dto.tableIds.length === 0;
    const targetTime = new Date(dto.time);
    const now = new Date();
    if (isNaN(targetTime.getTime())) {
      throw Object.assign(new Error('Định dạng thời gian không hợp lệ'), { statusCode: 400 });
    }
    if (targetTime.getTime() < now.getTime()) {
      throw Object.assign(new Error('Thời gian đặt bàn không được ở quá khứ'), { statusCode: 400 });
    }

    // min_advance_booking_hours (default 1)
    const minAdvanceHours = config.min_advance_booking_hours ?? 1;
    const minAdvanceMs = minAdvanceHours * 60 * 60 * 1000;
    if (targetTime.getTime() - now.getTime() < minAdvanceMs) {
      throw Object.assign(new Error(`Vui lòng đặt bàn trước giờ nhận ít nhất ${minAdvanceHours} tiếng`), { statusCode: 400 });
    }

    // max_advance_booking_days (default 30)
    const maxAdvanceDays = config.max_advance_booking_days ?? 30;
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + maxAdvanceDays);
    if (targetTime.getTime() > maxFuture.getTime()) {
      throw Object.assign(new Error(`Hệ thống chỉ cho phép đặt bàn trước tối đa ${maxAdvanceDays} ngày`), { statusCode: 400 });
    }

    // closed_dates (default [])
    const closedDates = config.closed_dates ?? [];
    const localDate = new Date(targetTime.getTime() + 7 * 60 * 60 * 1000);
    const dateStr = localDate.toISOString().split('T')[0]; // YYYY-MM-DD in UTC+7
    if (closedDates.includes(dateStr)) {
      throw Object.assign(new Error(`Nhà hàng nghỉ/đóng cửa vào ngày đã chọn (${dateStr})`), { statusCode: 400 });
    }

    // 3. Validate business hours (based on config opening_time / closing_time)
    const localHour = targetTime.getUTCHours() + 7;
    const hour = localHour >= 24 ? localHour - 24 : localHour;
    const minutes = targetTime.getUTCMinutes();
    const timeInMinutes = hour * 60 + minutes;

    const openParts = (config.opening_time ?? "10:00").split(":");
    const closeParts = (config.closing_time ?? "22:00").split(":");
    const openingTime = parseInt(openParts[0]) * 60 + parseInt(openParts[1] || "0");
    const closingTime = parseInt(closeParts[0]) * 60 + parseInt(closeParts[1] || "0");
    
    // last_booking_before_close_minutes (default 60)
    const lastBookingBeforeClose = config.last_booking_before_close_minutes ?? 60;
    const lastOrderTime = closingTime - lastBookingBeforeClose;

    if (timeInMinutes < openingTime || timeInMinutes > closingTime) {
      throw Object.assign(new Error(`Thời gian đặt ngoài giờ mở cửa của nhà hàng (${config.opening_time ?? "10:00"} - ${config.closing_time ?? "22:00"})`), { statusCode: 400 });
    }
    if (timeInMinutes > lastOrderTime) {
      const lastHourStr = Math.floor(lastOrderTime / 60).toString().padStart(2, '0');
      const lastMinStr = (lastOrderTime % 60).toString().padStart(2, '0');
      throw Object.assign(new Error(`Lượt đặt quá muộn. Thời gian đặt bàn muộn nhất là ${lastHourStr}:${lastMinStr}`), { statusCode: 400 });
    }

    // 4. Fetch active status IDs for double-booking check
    const activeStatusIds = await prisma.statusValue.findMany({
      where: { code: { in: ['PENDING', 'CONFIRMED'] } },
      select: { id: true }
    }).then(list => list.map(s => s.id));

    // 5. Prevent double booking (same customer booking at same time)
    const bufferBeforeSelf = new Date(targetTime.getTime() - 30 * 60 * 1000);
    const bufferAfterSelf = new Date(targetTime.getTime() + 30 * 60 * 1000);
    const doubleBooked = await prisma.reservation.findFirst({
      where: {
        customerId: dto.customerId,
        time: { gte: bufferBeforeSelf, lte: bufferAfterSelf },
        reservationStatusId: { in: activeStatusIds }
      }
    });
    if (doubleBooked) {
      throw Object.assign(new Error('Bạn đã có một lịch đặt bàn khác trùng khung giờ này'), { statusCode: 400 });
    }

    if (isAuto) {
      dto.tableIds = await this.getOptimalTableAssignment(dto.restaurantId, targetTime, dto.numberOfGuests);
    }

    // 6. Validate selected tables status, capacity and hard conflict overlaps
    if (dto.tableIds && dto.tableIds.length > 0) {
      const dbTables = await prisma.table.findMany({
        where: {
          id: { in: dto.tableIds },
          restaurantId: dto.restaurantId,
          isActive: true
        },
        select: { id: true, code: true, seatingCapacity: true }
      });
      if (dbTables.length !== dto.tableIds.length) {
        throw Object.assign(new Error('Một hoặc nhiều bàn được chọn không tồn tại hoặc đã ngừng hoạt động'), { statusCode: 400 });
      }

      const totalCapacity = dbTables.reduce((sum, t) => sum + t.seatingCapacity, 0);
      if (totalCapacity < dto.numberOfGuests) {
        throw Object.assign(new Error(`Tổng sức chứa các bàn được chọn (${totalCapacity} người) không đủ cho số khách đặt (${dto.numberOfGuests} người)`), { statusCode: 400 });
      }

      // Hard conflict check (overlap under 30 minutes)
      const bufferBefore = new Date(targetTime.getTime() - 30 * 60 * 1000);
      const bufferAfter = new Date(targetTime.getTime() + 30 * 60 * 1000);
      const conflict = await prisma.reservationTable.findFirst({
        where: {
          tableId: { in: dto.tableIds },
          reservation: {
            restaurantId: dto.restaurantId,
            time: { gte: bufferBefore, lte: bufferAfter },
            statusValue: { code: { notIn: ['CANCELLED'] } }
          }
        },
        include: { table: { select: { code: true } } }
      });
      if (conflict) {
        throw Object.assign(new Error(`Bàn ${conflict.table.code} đã có lượt đặt trước trùng khung giờ này`), { statusCode: 400 });
      }

      // Check soft conflicts (within 90 minutes) and backup table requirements
      const checkBufferBefore = new Date(targetTime.getTime() - 90 * 60 * 1000);
      const checkBufferAfter = new Date(targetTime.getTime() + 90 * 60 * 1000);

      // Find all reservations in the 90m window
      const windowReservations = await prisma.reservationTable.findMany({
        where: {
          reservation: {
            restaurantId: dto.restaurantId,
            time: { gte: checkBufferBefore, lte: checkBufferAfter },
            statusValue: { code: { notIn: ['CANCELLED'] } },
          }
        },
        select: {
          tableId: true,
          reservation: { select: { time: true } }
        }
      });

      // Find all active tables in the restaurant
      const allActiveTables = await prisma.table.findMany({
        where: { restaurantId: dto.restaurantId, isActive: true }
      });

      for (const tableId of dto.tableIds) {
        const table = allActiveTables.find(t => t.id === tableId);
        if (!table) continue;

        const tableConflicts = windowReservations.filter(wr => wr.tableId === tableId);
        if (tableConflicts.length > 0) {
          // Soft conflict: check if there is at least 1 backup table (capacity >= numberOfGuests) that has 0 conflicts
          const hasBackup = allActiveTables.some(other => {
            if (other.id === tableId) return false;
            if (other.seatingCapacity < dto.numberOfGuests) return false;
            const otherConflicts = windowReservations.filter(wr => wr.tableId === other.id);
            return otherConflicts.length === 0;
          });

          if (!hasBackup && !isAuto) {
            throw Object.assign(new Error(`Bàn ${table.code} hiện bận ở khung giờ lân cận và nhà hàng không còn bàn dự phòng nào khác cùng sức chứa. Vui lòng chọn bàn khác hoặc để nhà hàng tự sắp xếp.`), { statusCode: 400 });
          }
        }
      }
    }

    // Calculate mustLeaveBy if there is a booking after this one on the selected tables (within 4 hours)
    let mustLeaveBy: Date | null = null;
    if (dto.tableIds && dto.tableIds.length > 0) {
      const nextBooking = await prisma.reservationTable.findFirst({
        where: {
          tableId: { in: dto.tableIds },
          reservation: {
            restaurantId: dto.restaurantId,
            time: { gt: targetTime, lte: new Date(targetTime.getTime() + 4 * 60 * 60 * 1000) },
            statusValue: { code: { notIn: ['CANCELLED'] } }
          }
        },
        include: { reservation: { select: { time: true } } },
        orderBy: { reservation: { time: 'asc' } }
      });
      if (nextBooking) {
        // cleaning buffer = 30 minutes
        mustLeaveBy = new Date(new Date(nextBooking.reservation.time).getTime() - 30 * 60 * 1000);
      }
    }

    const pendingStatus = await this.getStatusByCode('PENDING');
    if (!pendingStatus) throw new Error('Status PENDING not configured');

    // Calculate deposit amount dynamically
    let calculatedDeposit = 0;
    if (config.deposit_enabled === true) {
      if (config.deposit_amount !== undefined && config.deposit_amount !== null && Number(config.deposit_amount) > 0) {
        calculatedDeposit = Number(config.deposit_amount);
      } else {
        // Fallback to default calculation if amount is not specified
        if (!isAuto && dto.tableIds && dto.tableIds.length > 0) {
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
      }
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

    // Set paymentDeadline — 5 minutes from now if deposit > 0
    const paymentDeadline = calculatedDeposit > 0 ? new Date(Date.now() + 5 * 60 * 1000) : null;

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
        metadata: mustLeaveBy ? { mustLeaveBy: mustLeaveBy.toISOString() } : {},
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

    // Send confirmation email immediately only if no deposit is required.
    // If a deposit is required, the email will be sent after payment is completed.
    if (calculatedDeposit === 0) {
      this.sendConfirmationEmail(reservation.id).catch((e: any) =>
        console.error('[CreateReservation] Failed to send email:', e)
      );
    }

    // Save bankRefund info into Customer metadata for auto-payout on cancellation
    if (dto.bankRefund && dto.bankRefund.accountNumber) {
      try {
        const existingCustomer = await prisma.customer.findUnique({
          where: { id: dto.customerId },
          select: { metadata: true }
        });
        const existingMeta: any = existingCustomer?.metadata ?? {};
        await prisma.customer.update({
          where: { id: dto.customerId },
          data: {
            metadata: {
              ...existingMeta,
              bankRefund: {
                bankBin: dto.bankRefund.bankBin,
                bankCode: dto.bankRefund.bankCode,
                bankName: dto.bankRefund.bankName ?? '',
                accountNumber: dto.bankRefund.accountNumber,
                accountName: dto.bankRefund.accountName,
                savedAt: new Date().toISOString(),
              }
            }
          }
        });
      } catch (metaErr: any) {
        // Non-blocking: bank info save failure should not fail the reservation
        console.warn('[CreateReservation] Failed to save bankRefund to Customer.metadata:', metaErr?.message);
      }
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
        refunds: { orderBy: { createdAt: 'desc' } },
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
        refunds: { orderBy: { createdAt: 'desc' } },
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

    const updated = await prisma.reservation.update({
      where: { id },
      data: updateData,
      include: {
        statusValue: true,
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });

    if (targetCode === 'CONFIRMED') {
      this.sendConfirmationEmail(id).catch((e: any) =>
        console.error('[UpdateStatus] Failed to send confirmation email:', e)
      );
    }

    return updated;
  }

  // ── Check-in ─────────────────────────────────────────────────────────────────
  async checkIn(code: string, actorId?: string) {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { confirmationCode: code },
      include: {
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        tables: { include: { table: { select: { id: true, code: true } } } },
        restaurant: { select: { id: true, metadata: true } },
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

    const now = new Date();
    const config = (reservation.restaurant?.metadata as any)?.reservationConfig ?? {};
    const earlyCheckinMinutes = config.early_checkin_minutes ?? 15;
    const lateCheckinMinutes = config.late_checkin_minutes ?? 30;

    const resTime = new Date(reservation.time);
    const earlyLimit = new Date(resTime.getTime() - earlyCheckinMinutes * 60 * 1000);
    const lateLimit = new Date(resTime.getTime() + lateCheckinMinutes * 60 * 1000);

    if (now.getTime() < earlyLimit.getTime()) {
      const earlyTimeStr = new Date(earlyLimit.getTime() + 7 * 60 * 60 * 1000).toISOString().substr(11, 5);
      throw Object.assign(new Error(`Không thể check-in trước thời gian cho phép (Sớm tối đa ${earlyCheckinMinutes} phút. Thời gian check-in sớm nhất là từ ${earlyTimeStr})`), { statusCode: 400 });
    }
    if (now.getTime() > lateLimit.getTime()) {
      throw Object.assign(new Error(`Đã quá thời hạn check-in (Trễ tối đa ${lateCheckinMinutes} phút). Vui lòng liên hệ nhân viên để xử lý.`), { statusCode: 400 });
    }

    const checkedInStatus = await this.getStatusByCode('CHECKED_IN');
    if (!checkedInStatus) throw new Error('Status CHECKED_IN not configured');

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
  async cancel(id: string, actorId?: string, isStaff: boolean = false, approveReview?: boolean, reason?: string) {
    const prisma = getPrisma();

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        statusValue: { select: { code: true } },
        payments: { where: { status: 1 }, include: { paymentMethod: { select: { code: true } } } }, // completed payments
        restaurant: { select: { metadata: true } },
      }
    });
    if (!reservation) throw Object.assign(new Error('Reservation not found'), { statusCode: 404 });

    const cancelledStatus = await this.getStatusByCode('CANCELLED');
    if (!cancelledStatus) throw new Error('Status CANCELLED not configured');

    const now = new Date();
    const completedDeposits = reservation.payments;
    const totalDeposit = completedDeposits.reduce((sum, p) => sum + Number(p.amount), 0);

    const existingMeta: any = (reservation as any).metadata ?? {};

    // Customer cancellation
    const restaurantMeta = (reservation.restaurant?.metadata as any) ?? {};
    const config = restaurantMeta.reservationConfig ?? {};
    const freeCancellationHours = config.free_cancellation_hours ?? 12;
    const freeCancellationMs = freeCancellationHours * 60 * 60 * 1000;

    if (!isStaff) {
      const timeDiffMs = reservation.time.getTime() - now.getTime();
      if (timeDiffMs < 0) {
        throw Object.assign(new Error('Không thể hủy đặt bàn ở quá khứ'), { statusCode: 400 });
      }

      // If a deposit was paid and it is within free_cancellation_hours of the reservation time:
      if (totalDeposit > 0 && timeDiffMs < freeCancellationMs) {
        // Submit for manual review instead of cancelling immediately
        const cancellationInfo = {
          cancelledReason: `Yêu cầu hủy sát giờ (< ${freeCancellationHours} tiếng) cần xét duyệt.`,
          requestedAt: now.toISOString(),
        };

        const updated = await prisma.reservation.update({
          where: { id },
          data: {
            metadata: {
              ...existingMeta,
              isCancellationManualReviewPending: true,
              cancellationInfo,
            }
          },
          include: {
            statusValue: true,
            customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
            restaurant: { select: { name: true } },
          }
        });
        return updated;
      }
    }

    // Determine refund amount
    let refundAmount = 0;
    let refundReason = reason || 'Cancellation';

    if (isStaff && approveReview !== undefined) {
      if (approveReview === true) {
        // Staff approved cancellation: 100% refund
        refundAmount = totalDeposit;
        refundReason = reason || 'Staff approved cancellation (100% refund)';
      } else {
        // Staff rejected/forfeited cancellation: 0% refund
        refundAmount = 0;
        refundReason = reason || 'Staff rejected cancellation (No refund, deposit forfeited)';
      }
    } else {
      // Standard cancellation logic (auto-approved if >= freeCancellationHours, or based on cancellation fee configuration)
      if (totalDeposit > 0) {
        const timeDiffMs = reservation.time.getTime() - now.getTime();
        if (timeDiffMs >= freeCancellationMs) {
          // Free cancellation >= freeCancellationHours: 100% refund
          refundAmount = totalDeposit;
          refundReason = reason || `Cancelled >= ${freeCancellationHours} hours before (100% refund)`;
        } else {
          // Standard late fee calculation
          const restaurantMeta = (reservation.restaurant?.metadata as any) ?? {};
          const feePercent: number = restaurantMeta.cancellationFeePercent ?? 0;
          const reservationTime = reservation.time;
          const twoHoursBefore = new Date(reservationTime.getTime() - 2 * 60 * 60 * 1000);
          const isLateCancellation = now >= twoHoursBefore;

          const effectiveFeePercent = isLateCancellation ? 100 : Math.min(100, Math.max(0, feePercent));
          const cancellationFee = Math.floor(totalDeposit * effectiveFeePercent / 100);
          refundAmount = Math.max(0, totalDeposit - cancellationFee);
          refundReason = reason || (isLateCancellation ? 'Late cancellation (< 2 hours)' : `Cancellation fee ${effectiveFeePercent}%`);
        }
      }
    }

    // Build status history
    const statusHistory: any[] = existingMeta.statusHistory ?? [];
    statusHistory.push({
      from: reservation.statusValue?.code ?? '',
      to: 'CANCELLED',
      at: now.toISOString(),
      by: actorId ?? 'SYSTEM',
    });

    let refundRecord: any = null;
    if (totalDeposit > 0 && completedDeposits.length > 0) {
      try {
        refundRecord = await prisma.refund.create({
          data: {
            reservationId: id,
            amount: refundAmount,
            status: 'PENDING',
            metadata: {
              cancellation_timestamp: now.toISOString(),
              refund_reason: refundReason,
              total_deposit: totalDeposit,
            }
          }
        });
      } catch (refundErr: any) {
        console.error('[Cancel] Failed to create Refund record for reservation', id, ':', refundErr?.message);
        throw Object.assign(new Error('Internal error during refund creation'), { statusCode: 500 });
      }

      // Auto PayOS payout if: refundAmount > 0, deposit was via BANK_TRANSFER, customer has bankRefund info
      if (refundRecord && refundAmount > 0) {
        try {
          // Fetch customer bankRefund metadata
          const customer = await prisma.customer.findUnique({
            where: { id: reservation.customerId },
            select: { metadata: true }
          });
          const bankRefund = (customer?.metadata as any)?.bankRefund;

          // Check if the deposit was paid via bank transfer (not cash)
          const isBankTransfer = completedDeposits.some((p: any) => {
            const code = p.paymentMethod?.code ?? '';
            return code === 'BANK_TRANSFER' || code === 'SEPAY';
          });

          if (isBankTransfer && bankRefund?.accountNumber && bankRefund?.bankBin) {
            const payos = getPayOS();
            if (payos) {
              const referenceId = `REFUND_${Date.now().toString().slice(-10)}_${refundRecord.id.slice(0, 6)}`;
              try {
                const result = await (payos as any).payouts.create(
                  {
                    referenceId,
                    amount: Math.floor(refundAmount),
                    description: `XFOODI HOAN COC ${reservation.confirmationCode ?? id.slice(0, 6)}`.slice(0, 50),
                    toBin: bankRefund.bankBin,
                    toAccountNumber: bankRefund.accountNumber,
                  },
                  referenceId
                );
                // Update refund record to COMPLETED
                await prisma.refund.update({
                  where: { id: refundRecord.id },
                  data: {
                    status: 'COMPLETED',
                    metadata: {
                      cancellation_timestamp: now.toISOString(),
                      refund_reason: refundReason,
                      total_deposit: totalDeposit,
                      payout_method: 'PAYOS_AUTO',
                      payout_result: { externalTxId: result?.id ?? referenceId, status: 'SUCCESS' },
                      refund_bank: {
                        bankBin: bankRefund.bankBin,
                        bankCode: bankRefund.bankCode ?? '',
                        bankName: bankRefund.bankName ?? '',
                        accountNumber: bankRefund.accountNumber,
                        accountName: bankRefund.accountName,
                      }
                    }
                  }
                });
                console.log(`[Cancel] Auto-payout SUCCESS for reservation ${id}: ${refundAmount}đ → ${bankRefund.accountNumber}`);
              } catch (payoutErr: any) {
                // Payout failed → mark FAILED but do not block cancellation
                await prisma.refund.update({
                  where: { id: refundRecord.id },
                  data: {
                    status: 'FAILED',
                    metadata: {
                      cancellation_timestamp: now.toISOString(),
                      refund_reason: refundReason,
                      total_deposit: totalDeposit,
                      payout_method: 'PAYOS_AUTO',
                      payout_error: payoutErr?.message ?? 'Unknown payout error',
                      refund_bank: {
                        bankBin: bankRefund.bankBin,
                        accountNumber: bankRefund.accountNumber,
                        accountName: bankRefund.accountName,
                      }
                    }
                  }
                });
                console.error(`[Cancel] Auto-payout FAILED for reservation ${id}:`, payoutErr?.message);
              }
            }
          }
        } catch (autoPayoutSetupErr: any) {
          // Non-blocking: do not fail cancellation if auto-payout setup fails
          console.warn('[Cancel] Auto-payout setup error (non-blocking):', autoPayoutSetupErr?.message);
        }
      }
    }

    // Update reservation status to CANCELLED and clear review/no-show flags
    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        reservationStatusId: cancelledStatus.id,
        metadata: {
          ...existingMeta,
          statusHistory,
          isCancellationManualReviewPending: false,
          noShowAutoPending: false,
          cancellationInfo: {
            ...(existingMeta.cancellationInfo ?? {}),
            resolvedAt: now.toISOString(),
            approved: approveReview ?? true,
            refundAmount,
            cancelledReason: reason || existingMeta.cancellationInfo?.cancelledReason || 'Cancellation',
          }
        },
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
          reason: refundReason,
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

    // Find tables already reserved in that window with their reservation times
    const reservationTables = await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED'] } },
        },
      },
      select: {
        tableId: true,
        reservation: {
          select: {
            time: true,
          },
        },
      },
    });

    const conflicts = reservationTables.map((rt) => ({
      tableId: rt.tableId,
      time: new Date(rt.reservation.time),
    }));

    // Fetch all active tables
    const allTables = await prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        floor: { select: { id: true, name: true } },
        tableStatus: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });

    // Check which tables are free from hard conflicts
    const activeTablesNoHardConflict = allTables.filter((t) => {
      const tableConflicts = conflicts.filter((c) => c.tableId === t.id);
      const hasHardConflict = tableConflicts.some(
        (c) => Math.abs(c.time.getTime() - targetTime.getTime()) < 30 * 60 * 1000
      );
      return !hasHardConflict;
    });

    // 1. Check if a single table can accommodate numberOfGuests
    const fittingSingleTables = activeTablesNoHardConflict.filter(t => t.seatingCapacity >= numberOfGuests);
    
    let suggestedTableIds: string[] = [];
    let isCombinedSuggestion = false;

    if (fittingSingleTables.length > 0) {
      // Sort to suggest the smallest fitting table
      fittingSingleTables.sort((a, b) => {
        if (a.seatingCapacity !== b.seatingCapacity) {
          return a.seatingCapacity - b.seatingCapacity;
        }
        return a.code.localeCompare(b.code);
      });
      suggestedTableIds = [fittingSingleTables[0].id];
    } else {
      // 2. Try combining tables
      const bestCombo = this.findOptimalCombination(activeTablesNoHardConflict, numberOfGuests);
      if (bestCombo && bestCombo.length > 0) {
        suggestedTableIds = bestCombo.map(t => t.id);
        isCombinedSuggestion = true;
      }
    }

    const hasFittingSingleTable = fittingSingleTables.length > 0;

    return allTables.map((t) => {
      const tableConflicts = conflicts.filter((c) => c.tableId === t.id);
      const isSuggested = suggestedTableIds.includes(t.id);
      
      let isAvailable = false;
      let conflictTime: string | null = null;

      const hasHardConflict = tableConflicts.some(
        (c) => Math.abs(c.time.getTime() - targetTime.getTime()) < 30 * 60 * 1000
      );

      if (!hasHardConflict) {
        if (hasFittingSingleTable) {
          // If a single table fits, only tables with sufficient capacity are available
          isAvailable = t.seatingCapacity >= numberOfGuests;
        } else {
          // If combining is required, all tables without hard conflicts are available to select
          isAvailable = true;
        }

        // Soft conflict: check if there is a booking nearby (within 90 minutes but not hard conflict)
        const hasSoftConflict = tableConflicts.length > 0;
        if (hasSoftConflict) {
          // Case 2 soft conflict check for backup table (only if single table fits)
          if (hasFittingSingleTable) {
            const hasBackup = allTables.some((other) => {
              if (other.id === t.id) return false;
              if (other.seatingCapacity >= numberOfGuests) {
                const otherConflicts = conflicts.filter((c) => c.tableId === other.id);
                return otherConflicts.length === 0;
              }
              return false;
            });

            if (!hasBackup) {
              isAvailable = false;
            } else {
              conflictTime = tableConflicts[0].time.toISOString();
            }
          } else {
            // For combined tables, we just set conflictTime as soft conflict hint
            conflictTime = tableConflicts[0].time.toISOString();
          }
        }
      }

      return {
        ...t,
        isAvailable,
        conflictTime,
        isSuggested,
        isCombinedSuggestion,
      };
    });
  }

  // ── Send confirmation email helper ──────────────────────────────────────────
  async sendConfirmationEmail(reservationId: string) {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        tables: { include: { table: { select: { code: true } } } },
        customer: { include: { user: { select: { email: true } } } },
        restaurant: { select: { name: true } },
      }
    });
    if (!reservation || !reservation.customer?.user?.email) return;

    const tableCodes = reservation.tables.map((t: any) => t.table?.code).filter(Boolean);
    
    const { sendReservationConfirmationEmail } = await import('../lib/email');
    await sendReservationConfirmationEmail(reservation.customer.user.email, {
      restaurantName: reservation.restaurant?.name ?? '',
      confirmationCode: reservation.confirmationCode ?? '',
      numberOfGuests: reservation.numberOfGuests,
      time: reservation.time.toISOString(),
      depositAmount: Number(reservation.depositAmount),
      tableAssignments: tableCodes,
    }, reservation.id).catch((e: any) => console.error('[ReservationService] Confirmation email failed:', e));
  }

  // ── Resolve No Show ──────────────────────────────────────────────────────────
  async resolveNoShow(id: string) {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { id }
    });
    if (!reservation) throw Object.assign(new Error('Reservation not found'), { statusCode: 404 });

    const existingMeta: any = (reservation as any).metadata ?? {};
    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        metadata: {
          ...existingMeta,
          noShowAutoPending: false,
          noShowResolved: true,
        }
      },
      include: {
        statusValue: { select: { id: true, code: true, name: true, colorCode: true } },
        tables: { include: { table: { select: { id: true, code: true } } } },
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      }
    });
    return updated;
  }

  // ── Helper: find optimal combination of tables ────────────────────────────────
  findOptimalCombination(availableTables: any[], targetCapacity: number): any[] | null {
    let bestCombination: any[] | null = null;
    
    // Sort tables by capacity descending to find combinations faster
    const sortedTables = [...availableTables].sort((a, b) => b.seatingCapacity - a.seatingCapacity);
    
    const search = (index: number, currentCombo: any[], currentCapacity: number) => {
      if (currentCapacity >= targetCapacity) {
        if (!bestCombination) {
          bestCombination = [...currentCombo];
        } else {
          const bestSize = bestCombination.length;
          const curSize = currentCombo.length;
          if (curSize < bestSize) {
            bestCombination = [...currentCombo];
          } else if (curSize === bestSize) {
            const bestCap = bestCombination.reduce((sum, t) => sum + t.seatingCapacity, 0);
            const curCap = currentCombo.reduce((sum, t) => sum + t.seatingCapacity, 0);
            if (curCap < bestCap) {
              bestCombination = [...currentCombo];
            }
          }
        }
        return;
      }
      
      // Limit combination size to 6 tables to prevent recursion blowup/performance issues
      if (currentCombo.length >= 6) {
        return;
      }
      
      if (bestCombination && currentCombo.length >= bestCombination.length) {
        return;
      }
      
      for (let i = index; i < sortedTables.length; i++) {
        currentCombo.push(sortedTables[i]);
        search(i + 1, currentCombo, currentCapacity + sortedTables[i].seatingCapacity);
        currentCombo.pop();
      }
    };
    
    search(0, [], 0);
    return bestCombination;
  }

  // ── Helper: get optimal table assignment for auto reservations ──────────────
  async getOptimalTableAssignment(restaurantId: string, targetTime: Date, numberOfGuests: number): Promise<string[]> {
    const prisma = getPrisma();
    const bufferBefore = new Date(targetTime.getTime() - 90 * 60 * 1000);
    const bufferAfter = new Date(targetTime.getTime() + 90 * 60 * 1000);

    // Find tables already reserved in that window with their reservation times
    const reservationTables = await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED'] } },
        },
      },
      select: {
        tableId: true,
        reservation: { select: { time: true } },
      },
    });

    const conflicts = reservationTables.map((rt) => ({
      tableId: rt.tableId,
      time: new Date(rt.reservation.time),
    }));

    // Fetch all active tables
    const allTables = await prisma.table.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { code: 'asc' },
    });

    // Find tables with no hard conflict
    const activeTablesNoHardConflict = allTables.filter((t) => {
      const tableConflicts = conflicts.filter((c) => c.tableId === t.id);
      const hasHardConflict = tableConflicts.some(
        (c) => Math.abs(c.time.getTime() - targetTime.getTime()) < 30 * 60 * 1000
      );
      return !hasHardConflict;
    });

    // 1. Try to find a single table
    const fittingSingleTables = activeTablesNoHardConflict.filter(t => t.seatingCapacity >= numberOfGuests);
    if (fittingSingleTables.length > 0) {
      // Sort to suggest the smallest fitting table
      fittingSingleTables.sort((a, b) => {
        if (a.seatingCapacity !== b.seatingCapacity) {
          return a.seatingCapacity - b.seatingCapacity;
        }
        return a.code.localeCompare(b.code);
      });
      return [fittingSingleTables[0].id];
    }

    // 2. If no single table, try combining tables
    const bestCombo = this.findOptimalCombination(activeTablesNoHardConflict, numberOfGuests);
    if (bestCombo && bestCombo.length > 0) {
      return bestCombo.map(t => t.id);
    }

    throw Object.assign(new Error('Không còn bàn trống phù hợp cho số lượng khách trong khung giờ này. Vui lòng chọn thời gian khác hoặc giảm số khách.'), { statusCode: 400 });
  }
}

export const reservationService = new ReservationService();
