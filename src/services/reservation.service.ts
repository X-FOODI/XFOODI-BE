import { PrismaClient, Prisma } from '@prisma/client';
import { prismaStorage, centralPrisma } from '../lib/prisma';
import { randomBytes } from 'crypto';
import { sendReservationReminderEmail } from '../lib/email';
import { generateReservationQR } from './qr.service';

// PayOS payout helper (supports QuotaGuard/Fixie static proxy on Render)
// NOTE: https-proxy-agent v9 is ESM-only and can't be require()'d in CJS.
// Node.js native fetch also ignores the `agent` field in fetchOptions.
// Solution: use `undici` (CJS-compatible) with ProxyAgent + undici.fetch as custom fetch.
function getPayOS(): any | null {
  const clientId = process.env.PAYOS_CLIENT_ID?.trim();
  const apiKey = process.env.PAYOS_API_KEY?.trim();
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim();
  if (!clientId || !apiKey || !checksumKey) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PayOS } = require('@payos/node');
    const proxyUrl = process.env.QUOTAGUARDSTATIC_URL?.trim() || process.env.FIXIE_URL?.trim();

    let customFetch: any = undefined;
    if (proxyUrl) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { fetch: undiciF, ProxyAgent } = require('undici');
        const dispatcher = new ProxyAgent(proxyUrl);
        customFetch = (url: any, opts: any) => undiciF(url, { ...opts, dispatcher });
      } catch (e: any) {
        console.warn('[PayOS] undici ProxyAgent unavailable, falling back to no proxy:', e?.message);
      }
    }

    return new PayOS({
      clientId,
      apiKey,
      checksumKey,
      ...(customFetch ? { fetch: customFetch } : {}),
    });
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
  acceptTimeLimit?: boolean; // accept time limit dining overlap (leave 30 mins early)
  acceptWaitForPendingCheckin?: boolean; // accept waiting for prior reservation that hasn't checked in
  bankRefund?: {         // bank account to auto-payout refund if cancelled
    bankBin: string;
    bankCode: string;
    bankName?: string;
    accountNumber: string;
    accountName: string;
  };
  dishes?: Array<{
    dishId: string;
    quantity: number;
    note?: string;
  }>;
  userVoucherId?: string;
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
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ReservationService {

  // Self-healing: ensure RESERVATION status values exist in DB
  private async ensureReservationStatuses(): Promise<Record<string, string>> {
    const prisma = getPrisma();
    let statusType = await prisma.statusType.findUnique({ where: { code: 'RESERVATION' } });
    if (!statusType) {
      statusType = await prisma.statusType.create({ data: { code: 'RESERVATION' } });
    }
    const defaults = [
      { code: 'PENDING',    name: 'Chờ xác nhận', colorCode: '#f1c40f', isDefault: true },
      { code: 'CONFIRMED',  name: 'Đã xác nhận',  colorCode: '#3498db', isDefault: false },
      { code: 'CHECKED_IN', name: 'Đã check-in',  colorCode: '#9b59b6', isDefault: false },
      { code: 'COMPLETED',  name: 'Hoàn thành',   colorCode: '#2ecc71', isDefault: false },
      { code: 'CANCELLED',  name: 'Đã hủy',       colorCode: '#95a5a6', isDefault: false },
    ];
    const map: Record<string, string> = {};
    for (const s of defaults) {
      let val = await prisma.statusValue.findFirst({
        where: { statusTypeId: statusType.id, code: s.code }
      });
      if (!val) {
        val = await prisma.statusValue.create({
          data: {
            statusTypeId: statusType.id,
            code: s.code,
            name: s.name,
            colorCode: s.colorCode,
            isDefault: s.isDefault,
            isSystem: true,
          }
        });
      }
      map[s.code] = val.id;
    }
    return map;
  }

  // GET status value by code — always scoped to RESERVATION type
  private async getStatusByCode(code: string) {
    const prisma = getPrisma();
    // Find within RESERVATION statusType first
    const sv = await prisma.statusValue.findFirst({
      where: { statusType: { code: 'RESERVATION' }, code }
    });
    if (sv) return sv;
    // Fallback: run self-healing then retry
    await this.ensureReservationStatuses();
    return prisma.statusValue.findFirst({
      where: { statusType: { code: 'RESERVATION' }, code }
    });
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

    // Validate pre-ordered dishes upfront if provided
    if (dto.dishes && dto.dishes.length > 0) {
      for (const item of dto.dishes) {
        if (!item.dishId) {
          throw Object.assign(new Error('Mã món ăn trong đơn đặt trước là bắt buộc'), { statusCode: 400 });
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          throw Object.assign(new Error('Số lượng món ăn trong đơn đặt trước phải là số nguyên dương'), { statusCode: 400 });
        }
      }
      const dishIds = dto.dishes.map((item) => item.dishId);
      const uniqueDishIds = [...new Set(dishIds)];
      const dishes = await prisma.dish.findMany({
        where: { id: { in: uniqueDishIds }, restaurantId: dto.restaurantId, isActive: true },
      });
      if (dishes.length !== uniqueDishIds.length) {
        throw Object.assign(new Error('Một hoặc nhiều món ăn đặt trước không tồn tại hoặc đã ngừng bán'), { statusCode: 400 });
      }
    }

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
    const year = localDate.getUTCFullYear();
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD in UTC+7 local time
    if (closedDates.includes(dateStr)) {
      throw Object.assign(new Error(`Nhà hàng nghỉ/đóng cửa vào ngày đã chọn (${dateStr})`), { statusCode: 400 });
    }

    // 3. Validate business hours (based on config opening_time / closing_time and weekday config)
    const localHour = targetTime.getUTCHours() + 7;
    const hour = localHour >= 24 ? localHour - 24 : localHour;
    const minutes = targetTime.getUTCMinutes();
    const timeInMinutes = hour * 60 + minutes;

    let openStr = config.opening_time ?? "10:00";
    let closeStr = config.closing_time ?? "22:00";

    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayKey = days[localDate.getUTCDay()];
    const operatingHours = metadata.operatingHours || {};
    const dayConfig = operatingHours[dayKey];
    if (dayConfig) {
      if (!dayConfig.isOpen) {
        throw Object.assign(new Error(`Nhà hàng nghỉ/đóng cửa vào ngày đã chọn (${dateStr})`), { statusCode: 400 });
      }
      openStr = dayConfig.open || openStr;
      closeStr = dayConfig.close || closeStr;
    }

    const openParts = openStr.split(":");
    const closeParts = closeStr.split(":");
    const openingTime = parseInt(openParts[0]) * 60 + parseInt(openParts[1] || "0");
    const closingTime = parseInt(closeParts[0]) * 60 + parseInt(closeParts[1] || "0");
    
    // last_booking_before_close_minutes (default 60)
    const lastBookingBeforeClose = config.last_booking_before_close_minutes ?? 60;
    
    let isWithinOperatingHours = false;
    let isTooLate = false;
    let lastOrderTime = 0;

    if (closingTime >= openingTime) {
      isWithinOperatingHours = timeInMinutes >= openingTime && timeInMinutes <= closingTime;
      lastOrderTime = closingTime - lastBookingBeforeClose;
      isTooLate = isWithinOperatingHours && timeInMinutes > lastOrderTime;
    } else {
      // Midnight spanning, e.g. 18:00 (1080) to 02:00 (120)
      isWithinOperatingHours = timeInMinutes >= openingTime || timeInMinutes <= closingTime;
      lastOrderTime = closingTime - lastBookingBeforeClose;
      if (lastOrderTime < 0) {
        lastOrderTime += 24 * 60; // wrap to previous day
      }
      
      if (timeInMinutes >= openingTime) {
        // before midnight
        if (lastOrderTime >= openingTime) {
          isTooLate = timeInMinutes > lastOrderTime;
        } else {
          isTooLate = false; // last order is after midnight, so before midnight is fine
        }
      } else {
        // after midnight
        if (lastOrderTime >= openingTime) {
          isTooLate = true; // last order was before midnight!
        } else {
          isTooLate = timeInMinutes > lastOrderTime;
        }
      }
    }

    if (!isWithinOperatingHours) {
      throw Object.assign(new Error(`Thời gian đặt ngoài giờ mở cửa của nhà hàng (${openStr} - ${closeStr})`), { statusCode: 400 });
    }
    if (isTooLate) {
      let lastHour = Math.floor(lastOrderTime / 60);
      let lastMin = lastOrderTime % 60;
      const lastHourStr = lastHour.toString().padStart(2, '0');
      const lastMinStr = lastMin.toString().padStart(2, '0');
      throw Object.assign(new Error(`Lượt đặt quá muộn. Thời gian đặt bàn muộn nhất là ${lastHourStr}:${lastMinStr}`), { statusCode: 400 });
    }

    // Validate FIXED_SLOTS requirement if configured by restaurant
    if (config.time_slot_mode === "FIXED_SLOTS" && Array.isArray(config.fixed_time_slots) && config.fixed_time_slots.length > 0) {
      const selectedHourStr = String(hour).padStart(2, '0');
      const selectedMinStr = String(minutes).padStart(2, '0');
      const selectedTimeSlotStr = `${selectedHourStr}:${selectedMinStr}`;
      if (!config.fixed_time_slots.includes(selectedTimeSlotStr)) {
        throw Object.assign(
          new Error(`Khung giờ ${selectedTimeSlotStr} không thuộc danh sách khung giờ nhận đặt bàn của nhà hàng. Vui lòng chọn khung giờ khả dụng.`),
          { statusCode: 400 }
        );
      }
    }

    // 4. Prevent double booking (same customer booking at same time, buffer = dining duration)
    const hasConflict = await this.hasDoubleBookingConflict(dto.customerId, targetTime, dto.restaurantId);
    if (hasConflict) {
      throw Object.assign(new Error('Bạn đã có một lịch đặt bàn khác trùng khung giờ này (hoặc đang ngồi ăn tại nhà hàng)'), { statusCode: 400 });
    }

    if (isAuto) {
      dto.tableIds = await this.getOptimalTableAssignment(dto.restaurantId, targetTime, dto.numberOfGuests);
    }

    // Calculate mustLeaveBy if there is a booking after this one on the selected tables
    let mustLeaveBy: Date | null = null;

    // 6. Validate selected tables status, capacity, floors and conflicts
    const diningDurationMinutes = config.dining_duration_minutes ?? 90;
    const diningDurationMs = diningDurationMinutes * 60 * 1000;

    if (dto.tableIds && dto.tableIds.length > 0) {
      // Deduplicate table IDs
      dto.tableIds = [...new Set(dto.tableIds)];

      const dbTables = await prisma.table.findMany({
        where: {
          id: { in: dto.tableIds },
          restaurantId: dto.restaurantId,
          isActive: true,
          floor: { isActive: true } // Floor active check
        },
        select: { id: true, code: true, seatingCapacity: true, floorId: true }
      });
      if (dbTables.length !== dto.tableIds.length) {
        throw Object.assign(new Error('Một hoặc nhiều bàn được chọn không tồn tại, đã đóng cửa hoặc ngừng hoạt động'), { statusCode: 400 });
      }

      if (dto.tableIds.length > 1) {
        const floorIds = new Set(dbTables.map(t => t.floorId));
        if (floorIds.size > 1) {
          throw Object.assign(new Error('Tất cả các bàn được chọn để ghép phải nằm trên cùng một tầng/khu vực'), { statusCode: 400 });
        }
      }

      const totalCapacity = dbTables.reduce((sum, t) => sum + t.seatingCapacity, 0);
      if (totalCapacity < dto.numberOfGuests) {
        throw Object.assign(new Error(`Tổng sức chứa các bàn được chọn (${totalCapacity} người) không đủ cho số khách đặt (${dto.numberOfGuests} người)`), { statusCode: 400 });
      }

      // Guard: prevent a single small group from occupying a table that is way too large
      // Rule: a single table's capacity must not exceed guests + 2, UNLESS no smaller tables are available.
      const maxAllowed = dto.numberOfGuests + 2;
      if (dto.tableIds.length === 1 && !isAuto) {
        const singleTable = dbTables[0];
        if (singleTable.seatingCapacity > maxAllowed) {
          const smallerTablesExist = await this.checkIfSmallerTablesAvailable(
            dto.restaurantId,
            targetTime,
            dto.numberOfGuests,
            maxAllowed
          );
          if (smallerTablesExist) {
            throw Object.assign(
              new Error(`Bàn ${singleTable.code} có sức chứa ${singleTable.seatingCapacity} chỗ, quá lớn cho nhóm ${dto.numberOfGuests} người. Vui lòng chọn bàn nhỏ hơn (tối đa ${maxAllowed} chỗ) để tránh lãng phí bàn lớn.`),
              { statusCode: 400 }
            );
          }
        }
      }

      // Check if table is currently occupied by guests eating (if booking is within the dining duration window)
      const activeSessions = await prisma.tableSession.findMany({
        where: { tableId: { in: dto.tableIds }, isActive: true },
      });
      const isCurrentlyOccupied = activeSessions.length > 0 && (targetTime.getTime() - Date.now() < diningDurationMs);
      if (isCurrentlyOccupied) {
        throw Object.assign(new Error('Một hoặc nhiều bàn được chọn đang được khách ngồi ăn trực tiếp tại quán'), { statusCode: 400 });
      }

      // Time overlaps check
      const bufferBefore = new Date(targetTime.getTime() - diningDurationMs);
      const bufferAfter = new Date(targetTime.getTime() + diningDurationMs);
      const overlaps = await prisma.reservationTable.findMany({
        where: {
          tableId: { in: dto.tableIds },
          reservation: {
            restaurantId: dto.restaurantId,
            time: { gte: bufferBefore, lte: bufferAfter },
            statusValue: { code: { notIn: ['CANCELLED'] } },
            OR: [
              { paymentDeadline: null },
              { paymentDeadline: { gte: new Date() } }
            ]
          }
        },
        include: {
          table: { select: { code: true } },
          reservation: {
            select: {
              time: true,
              statusValue: { select: { code: true } },
            },
          },
        }
      });

      for (const overlap of overlaps) {
        const nextTime = new Date(overlap.reservation.time);
        if (nextTime.getTime() <= targetTime.getTime()) {
          // Overlap is a prior reservation in the dining window
          const priorStatus = overlap.reservation.statusValue?.code;
          const isPendingCheckin = ['PENDING', 'CONFIRMED'].includes(priorStatus);
          if (isPendingCheckin && dto.acceptWaitForPendingCheckin) {
            // Guest accepts waiting until prior party checks in / frees the table
            continue;
          }
          // Hard conflict: prior booking already checked in, or guest did not accept wait
          throw Object.assign(new Error(`Bàn ${overlap.table.code} đã có lượt đặt trước trùng khung giờ này`), { statusCode: 400 });
        }
        
        const diffMs = nextTime.getTime() - targetTime.getTime();
        const eatTimeMs = diffMs - 30 * 60 * 1000; // leave 30 mins early for cleaning
        if (eatTimeMs < 30 * 60 * 1000) {
          // less than 30 mins eating time -> hard conflict
          throw Object.assign(new Error(`Bàn ${overlap.table.code} đã có lượt đặt trước trùng khung giờ hoặc rất sát ca ăn này`), { statusCode: 400 });
        }

        if (!dto.acceptTimeLimit) {
          // Fallback to auto-assignment if not accepted
          try {
            dto.tableIds = await this.getOptimalTableAssignment(dto.restaurantId, targetTime, dto.numberOfGuests);
            // Deduplicate new tables
            dto.tableIds = [...new Set(dto.tableIds)];
            break;
          } catch (e) {
            throw Object.assign(new Error(`Bàn ${overlap.table.code} có giới hạn thời gian ăn tối đa là ${Math.floor(eatTimeMs / 60000)} phút. Bạn cần đồng ý giới hạn thời gian hoặc đổi giờ đặt.`), { statusCode: 400 });
          }
        } else {
          const limitLeave = new Date(nextTime.getTime() - 30 * 60 * 1000);
          if (!mustLeaveBy || limitLeave.getTime() < mustLeaveBy.getTime()) {
            mustLeaveBy = limitLeave;
          }
        }
      }
    }

    const pendingStatus = await this.getStatusByCode('PENDING');
    if (!pendingStatus) throw new Error('Status PENDING not configured');

    // Calculate deposit amount dynamically
    let calculatedDeposit = 0;
    if (config.deposit_enabled === true || String(config.deposit_enabled) === 'true') {
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
        metadata: {
          ...(mustLeaveBy ? { mustLeaveBy: mustLeaveBy.toISOString() } : {}),
          isAutoAssignment: isAuto,
        },
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

    // Create pre-ordered dishes if provided
    if (dto.dishes && dto.dishes.length > 0) {
      const dishIds = dto.dishes.map((item) => item.dishId);
      const uniqueDishIds = [...new Set(dishIds)];
      const dishes = await prisma.dish.findMany({
        where: { id: { in: uniqueDishIds }, restaurantId: dto.restaurantId, isActive: true },
      });

      const dishPriceMap = dishes.reduce((acc, dish) => {
        acc[dish.id] = Number(dish.price);
        return acc;
      }, {} as Record<string, number>);

      // Get or create ORDER and ORDER_DETAIL statuses
      const orderStatusType = await prisma.statusType.upsert({
        where: { code: 'ORDER' },
        update: {},
        create: { code: 'ORDER' },
      });
      let orderStatusPending = await prisma.statusValue.findFirst({
        where: { statusTypeId: orderStatusType.id, code: 'PENDING' },
      });
      if (!orderStatusPending) {
        orderStatusPending = await prisma.statusValue.create({
          data: {
            statusTypeId: orderStatusType.id,
            code: 'PENDING',
            name: 'Chờ xác nhận',
            colorCode: '#f1c40f',
            isSystem: true,
          },
        });
      }

      const detailStatusType = await prisma.statusType.upsert({
        where: { code: 'ORDER_DETAIL' },
        update: {},
        create: { code: 'ORDER_DETAIL' },
      });
      let orderDetailStatusPending = await prisma.statusValue.findFirst({
        where: { statusTypeId: detailStatusType.id, code: 'PENDING' },
      });
      if (!orderDetailStatusPending) {
        orderDetailStatusPending = await prisma.statusValue.create({
          data: {
            statusTypeId: detailStatusType.id,
            code: 'PENDING',
            name: 'Chờ làm',
            colorCode: '#f39c12',
            isSystem: true,
          },
        });
      }

      // Generate order reference — use reservation ID suffix to guarantee uniqueness
      const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const reference = `ORD-${todayStr}-${reservation.id.slice(-6).toUpperCase()}`;

      const subTotal = dto.dishes.reduce((sum, item) => sum + item.quantity * (dishPriceMap[item.dishId] || 0), 0);

      // ── Validate voucher if provided ────────────────────────────────────────
      let discountAmount = 0;
      let appliedVoucherMeta: Record<string, any> | null = null;

      if (dto.userVoucherId) {
        // UserVoucher lives in the Central DB (public schema)
        const userVoucher = await centralPrisma.userVoucher.findUnique({
          where: { id: dto.userVoucherId },
          include: { voucher: true },
        });

        if (!userVoucher) {
          throw Object.assign(new Error('Voucher không tồn tại trong ví của bạn'), { statusCode: 400 });
        }
        if (userVoucher.isUsed) {
          throw Object.assign(new Error('Voucher này đã được sử dụng'), { statusCode: 400 });
        }
        const v = userVoucher.voucher;
        if (!v || !v.isActive || v.status !== 'active') {
          throw Object.assign(new Error('Voucher hiện tại đang không hoạt động'), { statusCode: 400 });
        }
        if (new Date(v.expiryDate) < new Date()) {
          throw Object.assign(new Error('Voucher đã hết hạn sử dụng'), { statusCode: 400 });
        }
        if (v.restaurantId && v.restaurantId !== dto.restaurantId) {
          throw Object.assign(new Error('Voucher này không áp dụng cho nhà hàng hiện tại'), { statusCode: 400 });
        }

        // Calculate discount
        if (v.discountType === 'percentage') {
          discountAmount = subTotal * (Number(v.discountValue) / 100);
        } else {
          discountAmount = Number(v.discountValue);
        }
        discountAmount = Math.min(discountAmount, subTotal); // cap at subtotal

        appliedVoucherMeta = {
          userVoucherId: userVoucher.id,
          voucherId: v.id,
          code: v.code,
          discountType: v.discountType,
          discountValue: Number(v.discountValue),
          discountAmount,
        };
      }

      const taxableAmount = Math.max(0, subTotal - discountAmount);
      const taxAmount = taxableAmount * 0.1;
      const totalAmount = taxableAmount + taxAmount;

      const orderMetadata: Record<string, any> = {};
      if (appliedVoucherMeta) {
        orderMetadata.appliedVoucher = appliedVoucherMeta;
      }

      await prisma.order.create({
        data: {
          reference,
          restaurantId: dto.restaurantId,
          customerId: dto.customerId || null,
          reservationId: reservation.id,
          orderStatusId: orderStatusPending.id,
          subTotal: new Prisma.Decimal(subTotal),
          discountAmount: new Prisma.Decimal(discountAmount),
          taxAmount: new Prisma.Decimal(taxAmount),
          serviceCharge: 0,
          totalAmount: new Prisma.Decimal(totalAmount),
          ...(Object.keys(orderMetadata).length > 0 ? { metadata: orderMetadata } : {}),
          orderDetails: {
            create: dto.dishes.map((item) => ({
              dishId: item.dishId,
              quantity: item.quantity,
              note: item.note || null,
              itemStatusId: orderDetailStatusPending!.id,
              unitPrice: new Prisma.Decimal(dishPriceMap[item.dishId] || 0),
            })),
          },
        },
      });
    }

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

    // NOTE: Confirmation email (with code) is only sent when staff CONFIRMS the reservation.
    // We do NOT send it here at creation time. The pending email was already sent from the route handler.

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

    // Exclude PENDING reservations with a deposit requirement that hasn't been paid yet
    // (paymentDeadline is set = deposit required; reservation appears only after deposit is paid)
    const pendingStatusId = await this.getStatusByCode('PENDING').then(sv => sv?.id);
    if (pendingStatusId) {
      where.NOT = {
        AND: [
          { reservationStatusId: pendingStatusId },
          { depositAmount: { gt: 0 } },
          { paymentDeadline: { not: null } },
        ]
      };
    }


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

    const orderBy: any = {};
    if (filter.sortBy) {
      orderBy[filter.sortBy] = filter.sortOrder ?? 'asc';
    } else {
      orderBy.time = 'asc';
    }

    const [items, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
        orders: {
          include: {
            orderDetails: {
              include: {
                dish: { select: { id: true, name: true, price: true, imageUrl: true } },
                statusValue: { select: { id: true, code: true, name: true, colorCode: true } }
              }
            }
          }
        },
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
  async updateStatus(id: string, statusCode: string, actorId?: string, reason?: string) {
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

    // Broadcast status change to all listeners (restaurant staff + customer page)
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      const payload = {
        reservationId: id,
        status: targetCode,
        statusName: updated.statusValue?.name ?? targetCode,
        colorCode: updated.statusValue?.colorCode ?? null,
        updatedAt: now.toISOString(),
      };
      // Notify restaurant room (staff/admin panel)
      io.to(`restaurant_${(current as any).restaurantId}`).emit('RESERVATION_STATUS_CHANGED', payload);
      // Notify customer-specific reservation room
      io.to(`reservation_${id}`).emit('RESERVATION_STATUS_CHANGED', payload);
    } catch (socketErr: any) {
      console.warn('[UpdateStatus] Socket broadcast failed:', socketErr?.message);
    }

    if (targetCode === 'CANCELLED') {
      // Send rejection email with reason — non-blocking
      import('../lib/email').then(({ sendReservationRejectedEmail }) => {
        const customerEmail = updated.customer?.user?.email;
        if (customerEmail) {
          prisma.restaurant.findUnique({ where: { id: (current as any).restaurantId }, select: { name: true } })
            .then((rest: any) => {
              sendReservationRejectedEmail(customerEmail, {
                restaurantName: rest?.name ?? '',
                confirmationCode: (current as any).confirmationCode ?? '',
                numberOfGuests: (current as any).numberOfGuests,
                time: (current as any).time?.toISOString?.() ?? '',
                rejectionReason: reason ?? '',
              }, id).catch((e: any) => console.error('[UpdateStatus] Rejection email failed:', e));
            }).catch(() => {});
        }
      }).catch(() => {});
    }

    if (targetCode === 'CONFIRMED') {
      this.sendConfirmationEmail(id).catch((e: any) =>
        console.error('[UpdateStatus] Failed to send confirmation email:', e)
      );

      // Check if there is an associated pre-order and broadcast it to the kitchen
      (async () => {
        try {
          const order = await prisma.order.findFirst({
            where: { reservationId: id },
            include: {
              orderDetails: {
                include: {
                  dish: { select: { name: true, price: true, imageUrl: true } },
                  statusValue: { select: { code: true, name: true, colorCode: true } },
                },
              },
              customer: {
                include: {
                  user: true,
                },
              },
              reservation: true,
            },
          });

          if (order) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getIO } = require('../socket');
            const io = getIO();

            const statusMap = await prisma.statusValue.findFirst({
              where: { id: order.orderStatusId },
              select: { code: true }
            });

            const broadcastPayload = {
              id: order.id,
              reference: order.reference,
              table: null,
              tableId: null,
              subTotal: Number(order.subTotal),
              totalAmount: Number(order.totalAmount),
              createdAt: order.createdAt,
              status: statusMap?.code || 'PENDING',
              customerName: order.customer?.user?.fullName || order.customer?.user?.userName || null,
              customerPhone: order.customer?.user?.phoneNumber || null,
              customerEmail: order.customer?.user?.email || null,
              reservationId: order.reservationId,
              reservationTime: order.reservation?.time || null,
              reservationCode: order.reservation?.confirmationCode || null,
              items: order.orderDetails.map((d: any) => ({
                id: d.id,
                name: d.dish?.name || 'Món ăn',
                imageUrl: d.dish?.imageUrl || null,
                quantity: d.quantity,
                price: Number(d.unitPrice),
                note: d.note,
                status: d.statusValue?.code,
                statusName: d.statusValue?.name,
              })),
            };

            io.to(`restaurant_${updated.restaurantId || (current as any).restaurantId}`).emit('NEW_ORDER', broadcastPayload);
            console.log(`[UpdateStatus] Broadcasted pre-order ${order.reference} for confirmed reservation ${id}`);
          }
        } catch (orderBroadcastErr: any) {
          console.warn('[UpdateStatus] Failed to broadcast pre-order to kitchen:', orderBroadcastErr?.message);
        }
      })();
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

    // Guard: reservation must have at least one table assigned before check-in.
    // If tables = [] (e.g. auto-assignment failed or tables were removed), check-in would
    // succeed silently but no sessions/status updates would happen → system inconsistency.
    if (reservation.tables.length === 0) {
      throw Object.assign(
        new Error('Đặt bàn này chưa được phân bàn. Vui lòng phân bàn trước khi check-in.'),
        { statusCode: 400 }
      );
    }

    // Validate that all assigned tables are free from active sessions before checkin
    for (const rt of reservation.tables) {
      const existingSession = await prisma.tableSession.findFirst({
        where: { tableId: rt.tableId, isActive: true }
      });
      if (existingSession) {
        throw Object.assign(new Error(`Bàn ${rt.table?.code || 'được chọn'} đang được sử dụng bởi nhóm khách khác. Vui lòng thanh toán giải phóng bàn hoặc đổi bàn trước khi check-in.`), { statusCode: 400 });
      }
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

    // Bypass timing limit checks if checked in by Staff (actorId is present)
    if (!actorId) {
      if (now.getTime() < earlyLimit.getTime()) {
        const earlyTimeStr = new Date(earlyLimit.getTime() + 7 * 60 * 60 * 1000).toISOString().substr(11, 5);
        throw Object.assign(new Error(`Không thể check-in trước thời gian cho phép (Sớm tối đa ${earlyCheckinMinutes} phút. Thời gian check-in sớm nhất là từ ${earlyTimeStr})`), { statusCode: 400 });
      }
      if (now.getTime() > lateLimit.getTime()) {
        throw Object.assign(new Error(`Đã quá thời hạn check-in (Trễ tối đa ${lateCheckinMinutes} phút). Vui lòng liên hệ nhân viên để xử lý.`), { statusCode: 400 });
      }
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

    // Start table sessions for all assigned tables and link preorder if exists
    try {
      const preOrder = await prisma.order.findFirst({
        where: {
          reservationId: reservation.id,
          orderStatusId: {
            not: (await prisma.statusValue.findFirst({
              where: { statusType: { code: 'ORDER' }, code: 'CANCELLED' }
            }))?.id
          }
        },
        select: { id: true }
      });
      const orderId = preOrder?.id || null;

      // Find occupied status ID
      let occupiedStatus = await prisma.statusValue.findFirst({
        where: { statusType: { code: 'TABLE' }, code: 'OCCUPIED' }
      });
      if (!occupiedStatus) {
        const tableStatusType = await prisma.statusType.upsert({
          where: { code: 'TABLE' },
          update: {},
          create: { code: 'TABLE' }
        });
        occupiedStatus = await prisma.statusValue.create({
          data: {
            statusTypeId: tableStatusType.id,
            code: 'OCCUPIED',
            name: 'Đang dùng bữa',
            colorCode: '#e74c3c',
            isSystem: true
          }
        });
      }

      for (const rt of updated.tables) {
        const tableId = rt.tableId;
        // Check if there is already an active session
        const existingSession = await prisma.tableSession.findFirst({
          where: { tableId, isActive: true }
        });
        if (!existingSession) {
          // Create new table session
          const newSession = await prisma.tableSession.create({
            data: {
              tableId,
              orderId,
              startedAt: now,
              isActive: true
            }
          });
          // Update table status to Occupied
          await prisma.table.update({
            where: { id: tableId },
            data: { tableStatusId: occupiedStatus.id }
          });

          // Broadcast TABLE_SESSION_STARTED via socket
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getIO } = require('../socket');
            const io = getIO();
            io.to(`restaurant_${reservation.restaurantId}`).emit('TABLE_SESSION_STARTED', {
              tableId,
              sessionId: newSession.id,
              status: 'OCCUPIED',
            });
          } catch (e) {
            console.warn('[CheckIn] Socket broadcast failed:', e);
          }
        } else if (orderId && !existingSession.orderId) {
          // Link pre-order to existing active session if it doesn't have an order
          await prisma.tableSession.update({
            where: { id: existingSession.id },
            data: { orderId }
          });
        }
      }
    } catch (sessionErr: any) {
      console.error('[CheckIn] Failed to start table sessions:', sessionErr?.message);
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

    const completed = await prisma.reservation.update({
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

    // Broadcast COMPLETED status to customer page (real-time)
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      const payload = {
        reservationId: id,
        status: 'COMPLETED',
        statusName: completed.statusValue?.name ?? 'Hoàn thành',
        colorCode: completed.statusValue?.colorCode ?? null,
        updatedAt: now.toISOString(),
      };
      io.to(`restaurant_${(current as any).restaurantId}`).emit('RESERVATION_STATUS_CHANGED', payload);
      io.to(`reservation_${id}`).emit('RESERVATION_STATUS_CHANGED', payload);
    } catch (socketErr: any) {
      console.warn('[Complete] Socket broadcast failed:', socketErr?.message);
    }

    return completed;
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
      // Also update metadata isAutoAssignment to false
      const currentMetadata = (reservation.metadata as any) || {};
      updateData.metadata = {
        ...currentMetadata,
        isAutoAssignment: false,
      };
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

    // 9. Sync pending DEPOSIT payment if deposit amount changed
    // When staff reassigns tables, the deposit changes → the existing pending payment record must
    // reflect the new amount so the customer's QR screen shows the correct transfer total.
    if (newDepositAmount !== undefined) {
      const { PaymentStatus: PS, PaymentPurpose: PP } = await import('../enums/payment.enum');
      const pendingDeposit = await prisma.payment.findFirst({
        where: {
          reservationId: id,
          status: PS.PENDING,
          purpose: PP.DEPOSIT,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingDeposit) {
        if (newDepositAmount === 0) {
          // No deposit required anymore → cancel the pending payment
          await prisma.payment.update({
            where: { id: pendingDeposit.id },
            data: { status: PS.CANCELLED },
          });
          // Also clear paymentDeadline
          await prisma.reservation.update({
            where: { id },
            data: { paymentDeadline: null },
          });
        } else {
          // Update amount and wipe stale QR metadata so frontend regenerates it
          await prisma.payment.update({
            where: { id: pendingDeposit.id },
            data: {
              amount: newDepositAmount,
              metadata: {
                // Keep bankInfo if present, but clear QR so it gets regenerated on next /transfer-info call
                ...(typeof (pendingDeposit.metadata as any)?.bankInfo !== 'undefined'
                  ? { bankInfo: (pendingDeposit.metadata as any).bankInfo }
                  : {}),
                transferContent: (pendingDeposit.metadata as any)?.transferContent,
                amountUpdatedAt: new Date().toISOString(),
                staleQR: true,
              },
            },
          });
        }
        console.log(`[UpdateReservation] Synced pending deposit payment ${pendingDeposit.id}: ${Number(pendingDeposit.amount)} → ${newDepositAmount}`);
      }
    }

    // 10. Emit socket event so restaurant dashboard + customer page refresh in real-time
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      const socketPayload = {
        reservationId: id,
        tables: updated.tables.map(t => ({ id: t.tableId, code: t.table.code, seatingCapacity: t.table.seatingCapacity })),
        depositAmount: Number(updated.depositAmount),
        numberOfGuests: updated.numberOfGuests,
        updatedAt: new Date().toISOString(),
      };
      io.to(`restaurant_${reservation.restaurantId}`).emit('RESERVATION_UPDATED', socketPayload);
      io.to(`reservation_${id}`).emit('RESERVATION_UPDATED', socketPayload);
    } catch (socketErr: any) {
      console.warn('[UpdateReservation] Socket broadcast failed:', socketErr?.message);
    }

    // 11. Send modification email non-blocking
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
  async cancel(id: string, actorId?: string, isStaff: boolean = false, approveReview?: boolean, reason?: string, bankRefund?: any) {
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

    // Determine refund amount first to validate bank refund info
    let refundAmount = 0;
    if (totalDeposit > 0) {
      if (isStaff && approveReview !== undefined) {
        refundAmount = approveReview === true ? totalDeposit : 0;
      } else {
        const timeDiffMs = reservation.time.getTime() - now.getTime();
        if (timeDiffMs >= freeCancellationMs) {
          refundAmount = totalDeposit;
        } else {
          const feePercent: number = restaurantMeta.cancellationFeePercent ?? 0;
          const reservationTime = reservation.time;
          const twoHoursBefore = new Date(reservationTime.getTime() - 2 * 60 * 60 * 1000);
          const isLateCancellation = now >= twoHoursBefore;
          const effectiveFeePercent = isLateCancellation ? 100 : Math.min(100, Math.max(0, feePercent));
          const cancellationFee = Math.floor(totalDeposit * effectiveFeePercent / 100);
          refundAmount = Math.max(0, totalDeposit - cancellationFee);
        }
      }
    }

    // Validate bank refund info is present when cọc needs to be refunded
    let finalBankRefund = bankRefund;
    if (refundAmount > 0) {
      // 1. Try reading bankRefund attached specifically to this reservation's metadata (set during booking)
      const resMetaBankRefund = existingMeta.bankRefund;
      if (resMetaBankRefund && resMetaBankRefund.accountNumber && resMetaBankRefund.bankBin) {
        finalBankRefund = resMetaBankRefund;
      }

      // 2. Fallback to customer metadata if not found in reservation metadata or body
      if (!finalBankRefund || !finalBankRefund.accountNumber || !finalBankRefund.bankBin) {
        const customerRecord = await prisma.customer.findUnique({
          where: { id: reservation.customerId },
          select: { metadata: true }
        });
        const savedBankRefund = (customerRecord?.metadata as any)?.bankRefund;
        if (savedBankRefund && savedBankRefund.accountNumber && savedBankRefund.bankBin) {
          finalBankRefund = savedBankRefund;
        }
      }

      if (!finalBankRefund || !finalBankRefund.accountNumber || !finalBankRefund.bankBin) {
        throw Object.assign(new Error('Vui lòng cung cấp thông tin tài khoản ngân hàng để nhận tiền hoàn cọc.'), { statusCode: 400 });
      }
    }

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

    // Determine refund reason
    let refundReason = reason || 'Cancellation';

    if (isStaff && approveReview !== undefined) {
      if (approveReview === true) {
        refundReason = reason || 'Staff approved cancellation (100% refund)';
      } else {
        refundReason = reason || 'Staff rejected cancellation (No refund, deposit forfeited)';
      }
    } else {
      if (totalDeposit > 0) {
        const timeDiffMs = reservation.time.getTime() - now.getTime();
        if (timeDiffMs >= freeCancellationMs) {
          refundReason = reason || `Cancelled >= ${freeCancellationHours} hours before (100% refund)`;
        } else {
          const restaurantMeta = (reservation.restaurant?.metadata as any) ?? {};
          const feePercent: number = restaurantMeta.cancellationFeePercent ?? 0;
          const reservationTime = reservation.time;
          const twoHoursBefore = new Date(reservationTime.getTime() - 2 * 60 * 60 * 1000);
          const isLateCancellation = now >= twoHoursBefore;
          const effectiveFeePercent = isLateCancellation ? 100 : Math.min(100, Math.max(0, feePercent));
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
          // Check if the deposit was paid via bank transfer (not cash)
          const isBankTransfer = completedDeposits.some((p: any) => {
            const code = p.paymentMethod?.code ?? '';
            return code === 'BANK_TRANSFER' || code === 'SEPAY';
          });

          if (isBankTransfer) {
            const payos = getPayOS();
            if (payos && finalBankRefund?.accountNumber && finalBankRefund?.bankBin) {
              const referenceId = `REFUND_${Date.now().toString().slice(-10)}_${refundRecord.id.slice(0, 6)}`;
              try {
                const result = await (payos as any).payouts.create(
                  {
                    referenceId,
                    amount: Math.floor(refundAmount),
                    description: `XFOODI HOAN COC ${reservation.confirmationCode ?? id.slice(0, 6)}`.slice(0, 50),
                    toBin: finalBankRefund.bankBin,
                    toAccountNumber: finalBankRefund.accountNumber,
                  },
                  referenceId
                );
                // Update refund record to COMPLETED
                // Mask account number for security & privacy before storing in history
                const rawAcc = finalBankRefund.accountNumber || '';
                const maskedAcc = rawAcc.length > 4 ? '*'.repeat(rawAcc.length - 4) + rawAcc.slice(-4) : rawAcc;

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
                        bankBin: finalBankRefund.bankBin,
                        bankCode: finalBankRefund.bankCode ?? '',
                        bankName: finalBankRefund.bankName ?? '',
                        accountNumber: maskedAcc,
                        accountName: finalBankRefund.accountName,
                      }
                    }
                  }
                });
                console.log(`[Cancel] Auto-payout SUCCESS for reservation ${id}: ${refundAmount}đ → ${maskedAcc}`);
              } catch (payoutErr: any) {
                // Payout failed → mark FAILED and create notification
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
                        bankBin: finalBankRefund.bankBin,
                        accountNumber: finalBankRefund.accountNumber,
                        accountName: finalBankRefund.accountName,
                      }
                    }
                  }
                });
                console.error(`[Cancel] Auto-payout FAILED for reservation ${id}:`, payoutErr?.message);

                // Create alert notification for manual refund
                await prisma.notification.create({
                  data: {
                    restaurantId: reservation.restaurantId,
                    isBroadcast: false,
                    title: 'Yêu cầu hoàn tiền thủ công (Lỗi tự động)',
                    message: `Lệnh chuyển khoản tự động thất bại cho đặt bàn ${reservation.confirmationCode}. Vui lòng chuyển khoản thủ công số tiền ${refundAmount.toLocaleString('vi-VN')}đ tới tài khoản ${finalBankRefund.accountNumber} (${finalBankRefund.bankCode ?? 'Ngân hàng'}) - ${finalBankRefund.accountName}.`,
                    isPublished: true,
                    priority: 'HIGH',
                  }
                });
              }
            } else {
              // No payos or bankRefund info -> manual refund notification
              await prisma.notification.create({
                data: {
                  restaurantId: reservation.restaurantId,
                  isBroadcast: false,
                  title: 'Yêu cầu hoàn tiền thủ công',
                  message: `Đặt bàn ${reservation.confirmationCode} đã bị hủy. Cần chuyển khoản thủ công ${refundAmount.toLocaleString('vi-VN')}đ tới tài khoản ${finalBankRefund?.accountNumber || 'N/A'} (${finalBankRefund?.bankCode || 'N/A'}) - ${finalBankRefund?.accountName || 'N/A'}.`,
                  isPublished: true,
                  priority: 'HIGH',
                }
              });
            }
          } else {
            // Cash deposit -> manual cash refund notification
            await prisma.notification.create({
              data: {
                restaurantId: reservation.restaurantId,
                isBroadcast: false,
                title: 'Yêu cầu hoàn tiền thủ công (Tiền mặt)',
                message: `Đặt bàn ${reservation.confirmationCode} đã bị hủy. Vui lòng hoàn trả tiền cọc ${refundAmount.toLocaleString('vi-VN')}đ trực tiếp bằng tiền mặt cho khách hàng.`,
                isPublished: true,
                priority: 'HIGH',
              }
            });
          }
        } catch (autoPayoutSetupErr: any) {
          console.warn('[Cancel] Auto-payout setup error (non-blocking):', autoPayoutSetupErr?.message);
        }
      }
    }

    // If the reservation has an associated pre-order, update its status to CANCELLED and notify kitchen
    try {
      const order = await prisma.order.findFirst({
        where: { reservationId: id },
      });
      if (order) {
        const orderStatusType = await prisma.statusType.findUnique({
          where: { code: 'ORDER' },
        });
        if (orderStatusType) {
          const cancelledOrderStatus = await prisma.statusValue.findFirst({
            where: { statusTypeId: orderStatusType.id, code: 'CANCELLED' },
          });
          if (cancelledOrderStatus) {
            await prisma.order.update({
              where: { id: order.id },
              data: { orderStatusId: cancelledOrderStatus.id },
            });
            console.log(`[Cancel] Cancelled associated order ${order.reference} for reservation ${id}`);

            // Broadcast status change to kitchen
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { getIO } = require('../socket');
              const io = getIO();
              io.to(`restaurant_${reservation.restaurantId}`).emit('ORDER_STATUS_CHANGED', {
                orderId: order.id,
                status: 'CANCELLED',
              });
            } catch (socketErr: any) {
              console.warn('[Cancel] Socket broadcast failed for cancelled order:', socketErr?.message);
            }
          }
        }
      }
    } catch (orderCancelErr: any) {
      console.warn('[Cancel] Failed to cancel associated pre-order:', orderCancelErr?.message);
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

    // Fetch restaurant config for dining duration
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { metadata: true }
    });
    const metadata = (restaurant?.metadata as any) ?? {};
    const config = metadata.reservationConfig ?? {};
    const diningDurationMinutes = config.dining_duration_minutes ?? 90;
    const diningDurationMs = diningDurationMinutes * 60 * 1000;

    const bufferBefore = new Date(targetTime.getTime() - diningDurationMs);
    const bufferAfter = new Date(targetTime.getTime() + diningDurationMs);

    // Find tables already reserved in that window with their reservation times + status
    const reservationTables = await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        },
      },
      select: {
        tableId: true,
        reservation: {
          select: {
            time: true,
            statusValue: { select: { code: true } },
          },
        },
      },
    });

    const conflicts = reservationTables.map((rt) => ({
      tableId: rt.tableId,
      time: new Date(rt.reservation.time),
      status: rt.reservation.statusValue.code,
    }));

    // Find tables currently occupied
    const activeSessions = await prisma.tableSession.findMany({
      where: { isActive: true },
      select: { tableId: true }
    });
    const occupiedTableIds = activeSessions.map(s => s.tableId);

    // Fetch all active tables (including active floor check)
    const allTables = await prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
        floor: { isActive: true } // Floor active check
      },
      include: {
        floor: { select: { id: true, name: true, width: true, height: true, imageUrl: true } },
        tableStatus: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });

    // Check which tables are free from hard conflicts & not currently occupied
    // Note: past PENDING/CONFIRMED (not checked-in) are soft "PENDING_CHECKIN" — not hard blocks
    const activeTablesNoHardConflict = allTables.filter((t) => {
      const tableConflicts = conflicts.filter((c) => c.tableId === t.id);
      const hasHardConflict = tableConflicts.some((c) => {
        const diff = Math.abs(c.time.getTime() - targetTime.getTime());
        if (diff >= diningDurationMs) return false;
        // Past reservation still waiting to check in → not a hard block for suggestion
        if (
          c.time.getTime() < targetTime.getTime() &&
          ['PENDING', 'CONFIRMED'].includes(c.status)
        ) {
          return false;
        }
        return true;
      });
      const isCurrentlyOccupied = occupiedTableIds.includes(t.id) && (targetTime.getTime() - Date.now() < diningDurationMs);
      return !hasHardConflict && !isCurrentlyOccupied;
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
      let limitReason: string | null = null;
      let mustLeaveBy: string | null = null;
      let conflictType: 'PENDING_CHECKIN' | 'TIME_LIMIT' | null = null;
      let pendingReservation: {
        time: string;
        expectedEndTime: string;
        status: string;
      } | null = null;

      const isCurrentlyOccupied = occupiedTableIds.includes(t.id) && (targetTime.getTime() - Date.now() < diningDurationMs);

      // Past reservation overlapping dining window that hasn't checked in yet
      const pastOverlaps = tableConflicts
        .filter((c) => {
          const diff = targetTime.getTime() - c.time.getTime();
          return diff > 0 && diff < diningDurationMs;
        })
        .sort((a, b) => b.time.getTime() - a.time.getTime());

      const pendingBefore = pastOverlaps.find((c) => ['PENDING', 'CONFIRMED'].includes(c.status));
      const checkedInBefore = pastOverlaps.find((c) => c.status === 'CHECKED_IN');

      // Future reservation overlapping dining window
      const futureOverlaps = tableConflicts
        .filter((c) => {
          const diff = c.time.getTime() - targetTime.getTime();
          return diff > 0 && diff < diningDurationMs;
        })
        .sort((a, b) => a.time.getTime() - b.time.getTime());

      if (isCurrentlyOccupied || checkedInBefore) {
        // Truly occupied — cannot select
        return {
          ...t,
          isAvailable: false,
          conflictTime: null,
          isSuggested: false,
          isCombinedSuggestion,
          limitReason: null,
          mustLeaveBy: null,
          conflictType: null,
          pendingReservation: null,
        };
      }

      if (pendingBefore) {
        // Booking AFTER a reservation that hasn't checked in → special wait dialog
        const expectedEndTime = new Date(pendingBefore.time.getTime() + diningDurationMs);
        conflictType = 'PENDING_CHECKIN';
        isAvailable = false;
        pendingReservation = {
          time: pendingBefore.time.toISOString(),
          expectedEndTime: expectedEndTime.toISOString(),
          status: pendingBefore.status,
        };
        conflictTime = pendingBefore.time.toISOString();
      } else if (futureOverlaps.length > 0) {
        const nextBooking = futureOverlaps[0];
        const diffMs = nextBooking.time.getTime() - targetTime.getTime();
        const eatTimeMs = diffMs - 30 * 60 * 1000; // leave 30 mins early

        if (eatTimeMs < 30 * 60 * 1000) {
          // Too tight — treat as unavailable hard conflict
          isAvailable = false;
          conflictType = 'TIME_LIMIT';
          conflictTime = nextBooking.time.toISOString();
        } else {
          // Soft time-limit conflict — can accept leave-early
          if (hasFittingSingleTable) {
            isAvailable = t.seatingCapacity >= numberOfGuests;
          } else {
            isAvailable = true;
          }
          conflictType = 'TIME_LIMIT';
          conflictTime = nextBooking.time.toISOString();
          const leaveTime = new Date(nextBooking.time.getTime() - 30 * 60 * 1000);
          const localLeave = new Date(leaveTime.getTime() + 7 * 60 * 60 * 1000);
          const lHour = String(localLeave.getUTCHours()).padStart(2, '0');
          const lMin = String(localLeave.getUTCMinutes()).padStart(2, '0');
          mustLeaveBy = `${lHour}:${lMin}`;
          const nextHour = String(nextBooking.time.getUTCHours() + 7).padStart(2, '0');
          const nextMin = String(nextBooking.time.getUTCMinutes()).padStart(2, '0');
          limitReason = `Bàn này đã được đặt từ ${nextHour}:${nextMin}. Bạn chỉ được sử dụng bàn này đến ${mustLeaveBy} (tối đa ${Math.floor(eatTimeMs / 60000)} phút).`;
        }
      } else {
        // No overlapping conflicts
        const hasOtherHardConflict = tableConflicts.some((c) => {
          const diff = Math.abs(c.time.getTime() - targetTime.getTime());
          return diff < diningDurationMs && c.time.getTime() >= targetTime.getTime();
        });
        if (!hasOtherHardConflict) {
          if (hasFittingSingleTable) {
            isAvailable = t.seatingCapacity >= numberOfGuests;
          } else {
            isAvailable = true;
          }
        }
      }

      return {
        ...t,
        isAvailable,
        conflictTime,
        isSuggested,
        isCombinedSuggestion,
        limitReason,
        mustLeaveBy,
        conflictType,
        pendingReservation,
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
  /**
   * Get all tables with availability status for booking UI
   * Returns table status: FULLY_AVAILABLE, PARTIALLY_AVAILABLE (with next reservation), OCCUPIED, PENDING_CHECKIN
   */
  async getTablesWithAvailability(restaurantId: string, targetTime: Date, numberOfGuests: number) {
    const prisma = getPrisma();
    
    // Fetch restaurant config
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { metadata: true }
    });
    const metadata = (restaurant?.metadata as any) ?? {};
    const config = metadata.reservationConfig ?? {};
    const diningDurationMinutes = config.dining_duration_minutes ?? 90;
    const diningDurationMs = diningDurationMinutes * 60 * 1000;
    const bufferMinutes = config.buffer_minutes ?? 30;
    const lateCheckinMinutes = config.late_checkin_minutes ?? 30;

    // Find all tables
    const allTables = await prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
        floor: { isActive: true },
      },
      include: { floor: true },
      orderBy: { code: 'asc' },
    });

    // Find currently occupied tables
    const activeSessions = await prisma.tableSession.findMany({
      where: { isActive: true },
      select: { tableId: true }
    });
    const occupiedTableIds = new Set(activeSessions.map(s => s.tableId));

    // Find all reservations in the relevant time window
    const bufferBefore = new Date(targetTime.getTime() - diningDurationMs);
    const bufferAfter = new Date(targetTime.getTime() + diningDurationMs * 2); // Look further ahead

    const reservationTables = await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        },
      },
      select: {
        tableId: true,
        reservation: { 
          select: { 
            time: true, 
            numberOfGuests: true,
            statusValue: { select: { code: true } }
          } 
        },
      },
      orderBy: { reservation: { time: 'asc' } },
    });

    const now = new Date();

    // Build table status map
    const tableStatuses = allTables.map((table) => {
      // Check if currently occupied
      if (occupiedTableIds.has(table.id)) {
        return {
          id: table.id,
          code: table.code,
          seatingCapacity: table.seatingCapacity,
          floor: table.floor.name,
          status: 'OCCUPIED' as const,
          nextReservation: null,
          usableUntil: null,
          pendingReservation: null,
        };
      }

      // Find reservations for this table
      const tableReservations = reservationTables
        .filter((rt) => rt.tableId === table.id)
        .map((rt) => ({
          time: new Date(rt.reservation.time),
          status: rt.reservation.statusValue.code,
          numberOfGuests: rt.reservation.numberOfGuests,
        }))
        .sort((a, b) => a.time.getTime() - b.time.getTime());

      // Find reservations around target time
      const beforeReservation = tableReservations
        .filter((res) => res.time.getTime() < targetTime.getTime())
        .pop(); // Last reservation before target time

      const afterReservation = tableReservations
        .find((res) => res.time.getTime() > targetTime.getTime()); // First reservation after target time

      // Booking AFTER a prior reservation that hasn't checked in (within dining window)
      if (beforeReservation) {
        const timeDiff = targetTime.getTime() - beforeReservation.time.getTime();
        const overlapsDining = timeDiff < diningDurationMs;
        const isPendingOrConfirmed = ['PENDING', 'CONFIRMED'].includes(beforeReservation.status);

        if (overlapsDining && isPendingOrConfirmed) {
          const expectedEndTime = new Date(beforeReservation.time.getTime() + diningDurationMs);
          return {
            id: table.id,
            code: table.code,
            seatingCapacity: table.seatingCapacity,
            floor: table.floor.name,
            status: 'PENDING_CHECKIN' as const,
            nextReservation: afterReservation ? afterReservation.time.toISOString() : null,
            usableUntil: afterReservation
              ? new Date(afterReservation.time.getTime() - bufferMinutes * 60 * 1000).toISOString()
              : null,
            pendingReservation: {
              time: beforeReservation.time.toISOString(),
              expectedEndTime: expectedEndTime.toISOString(),
              status: beforeReservation.status,
            },
          };
        }
      }

      // Check if there's a hard conflict (reservation within dining duration)
      const hasHardConflict = tableReservations.some(
        (res) => Math.abs(res.time.getTime() - targetTime.getTime()) < diningDurationMs
      );

      if (hasHardConflict) {
        return {
          id: table.id,
          code: table.code,
          seatingCapacity: table.seatingCapacity,
          floor: table.floor.name,
          status: 'OCCUPIED' as const,
          nextReservation: null,
          usableUntil: null,
          pendingReservation: null,
        };
      }

      // Standard logic for next reservation (booking overlaps with future reservation)
      if (afterReservation) {
        const timeDiff = afterReservation.time.getTime() - targetTime.getTime();
        const isWithinDining = timeDiff < diningDurationMs;
        const isPendingOrConfirmed = ['PENDING', 'CONFIRMED'].includes(afterReservation.status);

        if (isWithinDining && isPendingOrConfirmed) {
          // Next reservation hasn't checked in yet and overlaps with current booking window
          const usableUntil = new Date(afterReservation.time.getTime() - bufferMinutes * 60 * 1000);
          return {
            id: table.id,
            code: table.code,
            seatingCapacity: table.seatingCapacity,
            floor: table.floor.name,
            status: 'PARTIALLY_AVAILABLE' as const,
            nextReservation: afterReservation.time.toISOString(),
            usableUntil: usableUntil.toISOString(),
            pendingReservation: null,
          };
        }
      }

      // Fully available
      return {
        id: table.id,
        code: table.code,
        seatingCapacity: table.seatingCapacity,
        floor: table.floor.name,
        status: 'FULLY_AVAILABLE' as const,
        nextReservation: null,
        usableUntil: null,
        pendingReservation: null,
      };
    });

    return tableStatuses;
  }

  async getOptimalTableAssignment(restaurantId: string, targetTime: Date, numberOfGuests: number): Promise<string[]> {
    const prisma = getPrisma();
    
    // Fetch restaurant config for dining duration
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { metadata: true }
    });
    const metadata = (restaurant?.metadata as any) ?? {};
    const config = metadata.reservationConfig ?? {};
    const diningDurationMinutes = config.dining_duration_minutes ?? 90;
    const diningDurationMs = diningDurationMinutes * 60 * 1000;

    const bufferBefore = new Date(targetTime.getTime() - diningDurationMs);
    const bufferAfter = new Date(targetTime.getTime() + diningDurationMs);

    // Find tables already reserved in that window with their reservation times
    // NOTE: Must exclude NO_SHOW same as checkAvailability — a NO_SHOW means the guest
    // never showed up so the table is physically free despite the reservation record.
    const reservationTables = await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED', 'NO_SHOW'] } },
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

    // Find tables currently occupied
    const activeSessions = await prisma.tableSession.findMany({
      where: { isActive: true },
      select: { tableId: true }
    });
    const occupiedTableIds = activeSessions.map(s => s.tableId);

    // Fetch all active tables
    const allTables = await prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
        floor: { isActive: true } // Floor active check
      },
      orderBy: { code: 'asc' },
    });

    // Find tables with no hard conflict and not currently occupied (if close to now)
    const activeTablesNoHardConflict = allTables.filter((t) => {
      const tableConflicts = conflicts.filter((c) => c.tableId === t.id);
      const hasHardConflict = tableConflicts.some(
        (c) => Math.abs(c.time.getTime() - targetTime.getTime()) < diningDurationMs
      );
      const isCurrentlyOccupied = occupiedTableIds.includes(t.id) && (targetTime.getTime() - Date.now() < diningDurationMs);
      return !hasHardConflict && !isCurrentlyOccupied;
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

  async hasDoubleBookingConflict(customerId: string, targetTime: Date, restaurantId: string): Promise<boolean> {
    const prisma = getPrisma();

    // Only block on CONFIRMED or CHECKED_IN — PENDING hasn't been accepted by restaurant yet
    const activeStatusIds = await prisma.statusValue.findMany({
      where: { code: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      select: { id: true }
    }).then(list => list.map(s => s.id));

    const now2 = new Date();

    // Customer double-booking: block only if same customer already has a confirmed booking
    // within ±30 min of the new time (to catch accidental duplicates, not legitimate separate bookings).
    // Table-level conflicts (same table, different customer) are handled separately.
    const DUPLICATE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    const windowStart = new Date(targetTime.getTime() - DUPLICATE_WINDOW_MS);
    const windowEnd   = new Date(targetTime.getTime() + DUPLICATE_WINDOW_MS);

    const doubleBooked = await prisma.reservation.findFirst({
      where: {
        customerId,
        time: { gte: windowStart, lte: windowEnd },
        reservationStatusId: { in: activeStatusIds },
        OR: [
          { paymentDeadline: null },
          { paymentDeadline: { gte: now2 } },
        ]
      }
    });
    return !!doubleBooked;
  }

  async checkIfSmallerTablesAvailable(
    restaurantId: string,
    targetTime: Date,
    numberOfGuests: number,
    maxAllowed: number
  ): Promise<boolean> {
    const prisma = getPrisma();
    
    // Fetch restaurant config for dining duration
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { metadata: true }
    });
    const metadata = (restaurant?.metadata as any) ?? {};
    const config = metadata.reservationConfig ?? {};
    const diningDurationMinutes = config.dining_duration_minutes ?? 90;
    const diningDurationMs = diningDurationMinutes * 60 * 1000;

    const bufferBefore = new Date(targetTime.getTime() - diningDurationMs);
    const bufferAfter = new Date(targetTime.getTime() + diningDurationMs);

    // Find tables already reserved
    const reservationTables = await prisma.reservationTable.findMany({
      where: {
        reservation: {
          restaurantId,
          time: { gte: bufferBefore, lte: bufferAfter },
          statusValue: { code: { notIn: ['CANCELLED'] } },
        },
      },
      select: { tableId: true },
    });
    const reservedTableIds = reservationTables.map(rt => rt.tableId);

    // Find tables currently occupied
    const activeSessions = await prisma.tableSession.findMany({
      where: { isActive: true },
      select: { tableId: true }
    });
    const occupiedTableIds = activeSessions.map(s => s.tableId);

    // Find if there is any active table within the small capacity range that is neither reserved nor occupied
    const smallerTable = await prisma.table.findFirst({
      where: {
        restaurantId,
        isActive: true,
        floor: { isActive: true },
        seatingCapacity: {
          gte: numberOfGuests,
          lte: maxAllowed
        },
        id: {
          notIn: [...reservedTableIds, ...occupiedTableIds]
        }
      }
    });

    return !!smallerTable;
  }

  async checkAvailableSlots(
    restaurantId: string,
    dateStr: string,
    numberOfGuests: number
  ): Promise<Record<string, boolean>> {
    const prisma = getPrisma();

    // 1. Fetch restaurant config and operating hours
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { metadata: true }
    });
    const metadata = (restaurant?.metadata as any) ?? {};
    const config = metadata.reservationConfig ?? {};
    const diningDurationMinutes = config.dining_duration_minutes ?? 90;
    const diningDurationMs = diningDurationMinutes * 60 * 1000;
    const lastBookingBeforeClose = config.last_booking_before_close_minutes ?? 60;

    let openStr = config.opening_time ?? "10:00";
    let closeStr = config.closing_time ?? "22:00";

    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const d = new Date(dateStr);
    const dayKey = days[d.getDay()];

    const operatingHours = metadata.operatingHours || {};
    const dayConfig = operatingHours[dayKey];
    if (dayConfig) {
      if (!dayConfig.isOpen) {
        // Closed today, all slots unavailable
        return {};
      }
      openStr = dayConfig.open || openStr;
      closeStr = dayConfig.close || closeStr;
    }

    const openParts = openStr.split(":");
    const closeParts = closeStr.split(":");
    const openMin = parseInt(openParts[0]) * 60 + parseInt(openParts[1] || "0");
    let closeMin = parseInt(closeParts[0]) * 60 + parseInt(closeParts[1] || "0");
    if (closeMin < openMin) {
      closeMin += 24 * 60;
    }
    const latestBookingMin = closeMin - lastBookingBeforeClose;

    // Generate slots
    const slots: string[] = [];
    for (let min = openMin; min <= latestBookingMin; min += 30) {
      const displayMin = min % (24 * 60);
      const h = Math.floor(displayMin / 60).toString().padStart(2, '0');
      const m = (displayMin % 60).toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
    }

    if (slots.length === 0) return {};

    // 2. Fetch all active tables once
    const allTables = await prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
        floor: { isActive: true }
      },
      select: {
        id: true,
        seatingCapacity: true
      }
    });

    // 3. Fetch all active reservations for the day (expand window around date)
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
    // Buffer time: extend window by diningDurationMs to catch overlapping reservations
    const bufferStart = new Date(startOfDay.getTime() - diningDurationMs);
    const bufferEnd = new Date(endOfDay.getTime() + diningDurationMs);

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        time: { gte: bufferStart, lte: bufferEnd },
        statusValue: { code: { notIn: ['CANCELLED'] } },
      },
      select: {
        time: true,
        tables: { select: { tableId: true } }
      }
    });

    // 4. Fetch all occupied tables
    const activeSessions = await prisma.tableSession.findMany({
      where: { isActive: true },
      select: { tableId: true }
    });
    const occupiedTableIds = new Set(activeSessions.map(s => s.tableId));

    // 5. Check availability for each slot in memory
    const results: Record<string, boolean> = {};

    for (const slot of slots) {
      const [sh, sm] = slot.split(":").map(Number);
      const slotTime = new Date(startOfDay);
      slotTime.setUTCHours(sh, sm, 0, 0);

      // Find tables reserved at this window
      const reservedTableIds = new Set<string>();
      for (const res of reservations) {
        const resTime = new Date(res.time);
        if (Math.abs(resTime.getTime() - slotTime.getTime()) < diningDurationMs) {
          res.tables.forEach(t => reservedTableIds.add(t.tableId));
        }
      }

      // Check if slot is close to now to filter occupied tables
      const isCloseToNow = Math.abs(slotTime.getTime() - Date.now()) < diningDurationMs;

      // Filter available tables for this slot
      const availableTablesForSlot = allTables.filter(t => {
        const isReserved = reservedTableIds.has(t.id);
        const isOccupied = isCloseToNow && occupiedTableIds.has(t.id);
        return !isReserved && !isOccupied;
      });

      // We need to see if we can accommodate `numberOfGuests`
      // Choice A: single table
      const hasSingleTable = availableTablesForSlot.some(t => t.seatingCapacity >= numberOfGuests);
      if (hasSingleTable) {
        results[slot] = true;
        continue;
      }

      // Choice B: combining tables
      const bestCombo = this.findOptimalCombination(availableTablesForSlot, numberOfGuests);
      results[slot] = !!(bestCombo && bestCombo.length > 0);
    }

    return results;
  }
}

export const reservationService = new ReservationService();
