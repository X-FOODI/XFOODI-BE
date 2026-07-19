import 'dotenv/config';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';
import { reservationService } from '../services/reservation.service';
import { PrismaClient } from '@prisma/client';

describe('Reservation Service Integration Tests', () => {
  let restaurant: any;
  let tenantPrisma: PrismaClient;
  let customerId: string;
  let testUserId: string;
  let testTableId1: string;
  let testTableId2: string;

  jest.setTimeout(60000);

  beforeAll(async () => {
    // 1. Get active restaurant (prefer gao-beer if available, else first active)
    restaurant = await centralPrisma.restaurant.findFirst({
      where: { slug: 'gao-beer', isActive: true }
    }) || await centralPrisma.restaurant.findFirst({
      where: { isActive: true }
    });

    if (!restaurant) {
      throw new Error('Please seed at least one active restaurant to run tests');
    }

    const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL!, restaurant.slug);
    tenantPrisma = getTenantPrisma(tenantDbUrl);

    // 2. Setup a test User in Central & Tenant
    const email = `test-user-${Date.now()}@xfoodi.com`;
    const user = await centralPrisma.user.create({
      data: {
        email,
        userName: email,
        fullName: 'Jest Test Customer',
        provider: 'guest',
        emailVerified: true,
        isActive: true,
      }
    });
    testUserId = user.id;

    await tenantPrisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        userName: user.userName,
        fullName: user.fullName,
        isActive: true,
        emailVerified: true,
      }
    });

    const customer = await tenantPrisma.customer.create({
      data: {
        userId: user.id,
        loyaltyPoints: 0,
        isActive: true,
      }
    });
    customerId = customer.id;

    // 3. Find or create two active tables on the same floor for testing
    let floor = await tenantPrisma.floor.findFirst({ where: { isActive: true } });
    if (!floor) {
      floor = await tenantPrisma.floor.create({
        data: {
          name: 'Tầng Trệt E2E',
          isActive: true,
          restaurant: { connect: { id: restaurant.id } }
        }
      });
    }

    const tables = await tenantPrisma.table.findMany({
      where: {
        floorId: floor.id,
        isActive: true,
        seatingCapacity: { gt: 0 }
      },
      take: 2
    });

    if (tables.length >= 2) {
      testTableId1 = tables[0].id;
      testTableId2 = tables[1].id;
    } else {
      // Find AVAILABLE table status
      const availStatus = await tenantPrisma.statusValue.findFirst({
        where: { code: 'AVAILABLE' }
      });
      if (!availStatus) {
        throw new Error('No AVAILABLE status found for table');
      }

      const table1 = await tenantPrisma.table.create({
        data: {
          code: `T-TEST-1-${Date.now()}`,
          type: 'standard',
          seatingCapacity: 4,
          shape: 'square',
          positionX: 100,
          positionY: 100,
          width: 60,
          height: 60,
          rotation: 0,
          isActive: true,
          floor: { connect: { id: floor.id } },
          restaurant: { connect: { id: restaurant.id } },
          tableStatus: { connect: { id: availStatus.id } }
        }
      });

      const table2 = await tenantPrisma.table.create({
        data: {
          code: `T-TEST-2-${Date.now()}`,
          type: 'standard',
          seatingCapacity: 6,
          shape: 'square',
          positionX: 200,
          positionY: 100,
          width: 60,
          height: 60,
          rotation: 0,
          isActive: true,
          floor: { connect: { id: floor.id } },
          restaurant: { connect: { id: restaurant.id } },
          tableStatus: { connect: { id: availStatus.id } }
        }
      });

      testTableId1 = table1.id;
      testTableId2 = table2.id;
    }

    // Clean up any legacy reservation associations for these two test tables
    await tenantPrisma.reservationTable.deleteMany({
      where: {
        tableId: { in: [testTableId1, testTableId2] }
      }
    });
  });

  afterAll(async () => {
    // Clean up created user and customer data
    if (testUserId) {
      await tenantPrisma.customer.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await tenantPrisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
      await centralPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    await tenantPrisma.$disconnect();
    await centralPrisma.$disconnect();
  });

  const runInContext = <T>(fn: () => Promise<T>): Promise<T> => {
    return prismaStorage.run(tenantPrisma, fn);
  };

  test('Happy Path: Booking table with deposit disabled', async () => {
    // 1. Temporarily disable deposit in config
    const originalMetadata = restaurant.metadata || {};
    const testMetadata = {
      ...originalMetadata,
      reservationConfig: {
        ...(originalMetadata.reservationConfig || {}),
        deposit_enabled: false,
        opening_time: '08:00',
        closing_time: '23:00',
        min_advance_booking_hours: 1
      }
    };

    const updatedRest = await centralPrisma.restaurant.update({
      where: { id: restaurant.id },
      data: { metadata: testMetadata }
    });
    console.log('UPDATED METADATA IN DB:', JSON.stringify(updatedRest.metadata, null, 2));

    // 2. Perform booking
    const bookingTime = new Date();
    bookingTime.setDate(bookingTime.getDate() + 1); // Tomorrow to avoid any close-to-midnight or current hour issues
    bookingTime.setHours(14, 0, 0, 0); // 14:00 (2:00 PM) tomorrow

    const dto = {
      restaurantId: restaurant.id,
      customerId,
      numberOfGuests: 4,
      time: bookingTime.toISOString(),
      tableIds: [testTableId1],
      specialRequests: 'No spicy food, please.'
    };

    console.log('DTO TIME:', dto.time);
    const tableInDb = await tenantPrisma.table.findUnique({
      where: { id: testTableId1 },
      include: { floor: true }
    });
    console.log('TABLE IN TENANT DB:', JSON.stringify(tableInDb, null, 2));

    const reservation = await runInContext(() => reservationService.createReservation(dto));

    expect(reservation).toBeDefined();
    expect(reservation.id).toBeDefined();
    expect(reservation.numberOfGuests).toBe(4);
    expect(Number(reservation.depositAmount)).toBe(0);

    // Verify it is created in the database
    const dbRes = await tenantPrisma.reservation.findUnique({
      where: { id: reservation.id },
      include: { tables: true }
    });
    expect(dbRes).toBeDefined();
    expect(dbRes?.specialRequests).toBe('No spicy food, please.');
    expect(dbRes?.tables.length).toBe(1);
    expect(dbRes?.tables[0].tableId).toBe(testTableId1);
  });

  test('Validation Path: Past booking time should be rejected', async () => {
    const bookingTime = new Date();
    bookingTime.setHours(bookingTime.getHours() - 1); // 1 hour in the past

    const dto = {
      restaurantId: restaurant.id,
      customerId,
      numberOfGuests: 2,
      time: bookingTime.toISOString(),
      tableIds: [testTableId1]
    };

    await expect(
      runInContext(() => reservationService.createReservation(dto))
    ).rejects.toThrow('Thời gian đặt bàn không được ở quá khứ');
  });

  test('Validation Path: Booking outside operating hours should be rejected', async () => {
    const originalMetadata = restaurant.metadata || {};
    const testMetadata = {
      ...originalMetadata,
      reservationConfig: {
        ...(originalMetadata.reservationConfig || {}),
        opening_time: '10:00',
        closing_time: '22:00',
      }
    };

    await centralPrisma.restaurant.update({
      where: { id: restaurant.id },
      data: { metadata: testMetadata }
    });

    const bookingTime = new Date();
    bookingTime.setDate(bookingTime.getDate() + 1);
    bookingTime.setHours(2, 0, 0, 0); // 2:00 AM local time

    const dto = {
      restaurantId: restaurant.id,
      customerId,
      numberOfGuests: 2,
      time: bookingTime.toISOString(),
      tableIds: [testTableId1]
    };

    await expect(
      runInContext(() => reservationService.createReservation(dto))
    ).rejects.toThrow('Thời gian đặt ngoài giờ mở cửa của nhà hàng');
  });

  test('Validation Path: Table double booking / conflict should be rejected', async () => {
    const bookingTime = new Date();
    bookingTime.setDate(bookingTime.getDate() + 2);
    bookingTime.setHours(12, 0, 0, 0); // 12:00 PM in 2 days

    const dto1 = {
      restaurantId: restaurant.id,
      customerId,
      numberOfGuests: 4,
      time: bookingTime.toISOString(),
      tableIds: [testTableId2]
    };

    // First booking succeeds
    const res1 = await runInContext(() => reservationService.createReservation(dto1));
    expect(res1).toBeDefined();

    // Second booking on same table at same time for another customer
    // Let's create a temporary second user & customer
    const email2 = `test-user-2-${Date.now()}@xfoodi.com`;
    const user2 = await centralPrisma.user.create({
      data: {
        email: email2,
        userName: email2,
        fullName: 'Jest Test Customer 2',
        provider: 'guest',
        emailVerified: true,
        isActive: true,
      }
    });

    await tenantPrisma.user.create({
      data: {
        id: user2.id,
        email: user2.email,
        userName: user2.userName,
        fullName: user2.fullName,
        isActive: true,
        emailVerified: true,
      }
    });

    const customer2 = await tenantPrisma.customer.create({
      data: {
        userId: user2.id,
        loyaltyPoints: 0,
        isActive: true,
      }
    });

    const dto2 = {
      restaurantId: restaurant.id,
      customerId: customer2.id,
      numberOfGuests: 4,
      time: bookingTime.toISOString(),
      tableIds: [testTableId2] // Same table!
    };

    try {
      await expect(
        runInContext(() => reservationService.createReservation(dto2))
      ).rejects.toThrow(); // Should throw error due to table conflict
    } finally {
      // Clean up customer 2
      await tenantPrisma.customer.deleteMany({ where: { userId: user2.id } }).catch(() => {});
      await tenantPrisma.user.deleteMany({ where: { id: user2.id } }).catch(() => {});
      await centralPrisma.user.delete({ where: { id: user2.id } }).catch(() => {});
    }
  });

  test('Auto Assignment Path: Booking with empty tableIds should auto-assign optimal table(s)', async () => {
    // Setup booking metadata
    const originalMetadata = restaurant.metadata || {};
    const testMetadata = {
      ...originalMetadata,
      reservationConfig: {
        ...(originalMetadata.reservationConfig || {}),
        deposit_enabled: false,
        opening_time: '08:00',
        closing_time: '23:00',
      }
    };

    await centralPrisma.restaurant.update({
      where: { id: restaurant.id },
      data: { metadata: testMetadata }
    });

    const bookingTime = new Date();
    bookingTime.setDate(bookingTime.getDate() + 3); // 3 days in the future
    bookingTime.setHours(15, 0, 0, 0); // 15:00

    const dto = {
      restaurantId: restaurant.id,
      customerId,
      numberOfGuests: 4,
      time: bookingTime.toISOString(),
      tableIds: [], // Empty array triggers auto assignment
      specialRequests: 'Auto assignment test'
    };

    const reservation = await runInContext(() => reservationService.createReservation(dto));

    expect(reservation).toBeDefined();
    expect(reservation.id).toBeDefined();
    
    // Verify that the table was auto-assigned in the database
    const dbRes = await tenantPrisma.reservation.findUnique({
      where: { id: reservation.id },
      include: { tables: { include: { table: true } } }
    });
    
    expect(dbRes).toBeDefined();
    expect(dbRes?.tables.length).toBeGreaterThan(0);
    
    // Check that the assigned table has enough seating capacity
    const totalCapacity = dbRes?.tables.reduce((sum, t) => sum + t.table.seatingCapacity, 0) || 0;
    expect(totalCapacity).toBeGreaterThanOrEqual(4);
  });
});

