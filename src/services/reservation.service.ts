import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';
import { randomBytes } from 'crypto';

function getPrisma(): PrismaClient {
  return prismaStorage.getStore() as PrismaClient;
}

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

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId: dto.restaurantId,
        customerId: dto.customerId,
        numberOfGuests: dto.numberOfGuests,
        time: new Date(dto.time),
        specialRequests: dto.specialRequests,
        depositAmount: calculatedDeposit,
        reservationStatusId: pendingStatus.id,
        confirmationCode: generateConfirmationCode(),
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
  async updateStatus(id: string, statusCode: string) {
    const prisma = getPrisma();
    const status = await this.getStatusByCode(statusCode.toUpperCase());
    if (!status) throw new Error(`Status ${statusCode} not found`);

    return prisma.reservation.update({
      where: { id },
      data: { reservationStatusId: status.id },
      include: {
        statusValue: true,
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
  }

  // ── Check-in ─────────────────────────────────────────────────────────────────
  async checkIn(code: string) {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({ where: { confirmationCode: code } });
    if (!reservation) throw new Error('Reservation not found');

    const confirmedStatus = await this.getStatusByCode('CONFIRMED');
    if (!confirmedStatus) throw new Error('Status CONFIRMED not configured');

    // Mark checkedIn time + set status to CONFIRMED
    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        checkedInAt: new Date(),
        reservationStatusId: confirmedStatus.id,
      },
      include: {
        statusValue: true,
        tables: { include: { table: { select: { id: true, code: true } } } },
        customer: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });

    return updated;
  }

  // ── Cancel ───────────────────────────────────────────────────────────────────
  async cancel(id: string) {
    const prisma = getPrisma();
    const status = await this.getStatusByCode('CANCELLED');
    if (!status) throw new Error('Status CANCELLED not configured');

    return prisma.reservation.update({
      where: { id },
      data: { reservationStatusId: status.id },
      include: { statusValue: true },
    });
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
