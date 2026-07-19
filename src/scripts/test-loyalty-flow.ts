/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          XFOODI — Loyalty Points & Voucher Flow Test            ║
 * ║  Run with:                                                       ║
 * ║    npx ts-node --skip-project src/scripts/test-loyalty-flow.ts  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Scenario:
 *  1. Find an existing Restaurant and configure loyaltyPointRate.
 *  2. Find/create a User+Customer pair in that tenant's DB.
 *  3. Find/create a completed Order and run calculateAndRewardPoints().
 *  4. Assert points were credited (central + tenant).
 *  5. Create a Voucher in tenant DB.
 *  6. Redeem Voucher using loyalty points → assert points deducted,
 *     voucher quantity decremented, UserVoucher record created.
 *  7. Verify idempotency: re-running point calc on same order is no-op.
 *  8. Clean up all test data.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { PrismaClient, Prisma } from '@prisma/client';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

function log(msg: string)       { console.log(`  ${msg}`); }
function step(n: number, msg: string) { console.log(`\n${BOLD}${CYAN}[STEP ${n}]${RESET} ${BOLD}${msg}${RESET}`); }
function pass(msg: string)      { console.log(`  ${GREEN}✔ PASS${RESET}  ${msg}`); }
function fail(msg: string)      { console.log(`  ${RED}✖ FAIL${RESET}  ${msg}`); process.exitCode = 1; }
function info(label: string, val: any) { console.log(`  ${YELLOW}→${RESET} ${label}: ${BOLD}${JSON.stringify(val)}${RESET}`); }
function separator()            { console.log(`\n${'─'.repeat(65)}`); }

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { pass(message); passed++; }
  else           { fail(message); failed++; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`${BOLD}${CYAN}  XFOODI Loyalty Points & Voucher — Integration Test${RESET}`);
  console.log(`${'═'.repeat(65)}`);

  // ── 0. Prerequisites: find a real Restaurant ──────────────────────────────
  step(0, 'Discovering test restaurant from central DB…');

  const restaurant = await centralPrisma.restaurant.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, loyaltyPointRate: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!restaurant) {
    fail('No active restaurant found. Seed a restaurant first.');
    return;
  }

  info('Restaurant', { id: restaurant.id, name: restaurant.name, slug: restaurant.slug });

  // Build tenant Prisma client
  const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL!, restaurant.slug);
  const tenantPrisma = getTenantPrisma(tenantDbUrl);

  // Helper: run a callback inside the tenant context (mimics the HTTP middleware)
  async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
    return prismaStorage.run(tenantPrisma as unknown as PrismaClient, fn);
  }

  // ── STEP 0b: Ensure tenant schema is up-to-date ───────────────────────────
  step(0, `Syncing latest schema to tenant schema "tenant_${restaurant.slug}"…`);
  log('Running: npx prisma db push --skip-generate --accept-data-loss');
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      env: { ...process.env, DATABASE_URL: tenantDbUrl, DIRECT_URL: tenantDbUrl },
      stdio: 'pipe',
    });
    pass(`Tenant schema "tenant_${restaurant.slug}" is up-to-date.`);
    passed++;
  } catch (e: any) {
    fail(`Failed to push schema to tenant: ${e.message}`);
    return;
  }

  // ── STEP 1: Configure loyalty point rate ─────────────────────────────────
  step(1, 'Configure loyaltyPointRate = 10,000 VNĐ / point…');

  const RATE = 10_000;
  await centralPrisma.restaurant.update({
    where: { id: restaurant.id },
    data: { loyaltyPointRate: RATE },
  });
  const refreshed = await centralPrisma.restaurant.findUnique({
    where: { id: restaurant.id },
    select: { loyaltyPointRate: true },
  });
  info('loyaltyPointRate', refreshed?.loyaltyPointRate);
  assert(refreshed?.loyaltyPointRate === RATE, `loyaltyPointRate is ${RATE}`);

  // ── STEP 2: Find an existing Customer in the TENANT DB ───────────────────
  step(2, 'Resolving test Customer from tenant DB…');

  // The tenant DB has its own Users + Customers tables (synced from central).
  // Find a customer that has a userId set (linked to a real user).
  const tenantCustomerRecord = await runAsTenant(() =>
    tenantPrisma.customer.findFirst({
      where: { userId: { not: null }, isActive: true },
      orderBy: { createdAt: 'asc' },
    })
  );

  let userId: string;
  let customerId: string;

  if (tenantCustomerRecord?.userId) {
    userId = tenantCustomerRecord.userId;
    customerId = tenantCustomerRecord.id;
    info('Tenant Customer', { id: customerId, userId, currentPoints: tenantCustomerRecord.loyaltyPoints });
  } else {
    // No suitable customer: find a tenant User and create a Customer for them
    const tenantUser = await runAsTenant(() =>
      tenantPrisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    );
    if (!tenantUser) {
      fail('No active User found in tenant DB. Please seed the tenant first.');
      return;
    }
    userId = tenantUser.id;
    const newCustomer = await runAsTenant(() =>
      tenantPrisma.customer.create({
        data: { userId, loyaltyPoints: 0, isActive: true },
      })
    );
    customerId = newCustomer.id;
    log(`Created new Customer in tenant DB for userId=${userId}`);
    info('Tenant Customer', { id: customerId, userId });
  }

  // ── STEP 3: Create a test Order (COMPLETED) ───────────────────────────────
  step(3, 'Creating a test Order with totalAmount = 150,000 VNĐ…');

  // Need an orderStatusId for COMPLETED
  const completedStatus = await runAsTenant(() =>
    tenantPrisma.statusValue.findFirst({
      where: { statusType: { code: 'ORDER' }, code: 'COMPLETED' },
    })
  );

  if (!completedStatus) {
    fail('COMPLETED status value not seeded in tenant DB. Cannot create test order.');
    return;
  }

  const ORDER_TOTAL = 150_000; // VNĐ → should yield 15 points at 10,000/pt
  const EXPECTED_POINTS = Math.floor(ORDER_TOTAL / RATE);
  info('Expected points to earn', EXPECTED_POINTS);

  const testOrder = await runAsTenant(() =>
    tenantPrisma.order.create({
      data: {
        reference: `TEST-ORD-${Date.now()}`,
        restaurantId: restaurant.id,
        customerId,
        orderStatusId: completedStatus.id,
        subTotal: new Prisma.Decimal(ORDER_TOTAL),
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        serviceCharge: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(ORDER_TOTAL),
        completedAt: new Date(),
      },
    })
  );

  info('Created Order', { id: testOrder.id, reference: testOrder.reference, totalAmount: ORDER_TOTAL });
  assert(!!testOrder.id, 'Test order created successfully');

  // ── STEP 4: Run calculateAndRewardPoints ──────────────────────────────────
  step(4, 'Calling calculateAndRewardPoints()…');

  // Read points BEFORE
  const pointsBefore = await centralPrisma.userLoyaltyPoint.findUnique({
    where: { userId_restaurantId: { userId, restaurantId: restaurant.id } },
  });
  const balanceBefore = pointsBefore?.points ?? 0;
  info('Points balance BEFORE', balanceBefore);

  await runAsTenant(() =>
    // loyaltyService uses the prismaStorage context internally
    import('../services/loyalty.service').then(({ loyaltyService }) =>
      loyaltyService.calculateAndRewardPoints(testOrder.id)
    )
  );

  // Read points AFTER
  const pointsAfter = await centralPrisma.userLoyaltyPoint.findUnique({
    where: { userId_restaurantId: { userId, restaurantId: restaurant.id } },
  });
  const balanceAfter = pointsAfter?.points ?? 0;
  info('Points balance AFTER', balanceAfter);

  assert(balanceAfter === balanceBefore + EXPECTED_POINTS,
    `Central balance increased by ${EXPECTED_POINTS} (${balanceBefore} → ${balanceAfter})`);

  // Verify tenant Customer cache updated
  const tenantCustomerAfter = await runAsTenant(() =>
    tenantPrisma.customer.findUnique({ where: { id: customerId } })
  );
  info('Tenant Customer loyaltyPoints', tenantCustomerAfter?.loyaltyPoints);

  // Verify PointsTransaction created in tenant
  const earnTx = await runAsTenant(() =>
    tenantPrisma.pointsTransaction.findFirst({
      where: { orderId: testOrder.id, type: 'EARN' },
    })
  );
  info('PointsTransaction (EARN)', earnTx ? { id: earnTx.id, points: earnTx.points } : null);
  assert(!!earnTx, 'EARN PointsTransaction recorded in tenant DB');
  assert(earnTx?.points === EXPECTED_POINTS, `Transaction records ${EXPECTED_POINTS} points`);

  // ── STEP 5: Idempotency check ─────────────────────────────────────────────
  step(5, 'Idempotency check — re-running calculateAndRewardPoints on same order…');

  await runAsTenant(() =>
    import('../services/loyalty.service').then(({ loyaltyService }) =>
      loyaltyService.calculateAndRewardPoints(testOrder.id)
    )
  );

  const pointsAfterRetry = await centralPrisma.userLoyaltyPoint.findUnique({
    where: { userId_restaurantId: { userId, restaurantId: restaurant.id } },
  });
  info('Points after retry', pointsAfterRetry?.points);
  assert(
    pointsAfterRetry?.points === balanceAfter,
    `Points NOT double-credited (still ${balanceAfter})`
  );

  // ── STEP 6: Create a Voucher ──────────────────────────────────────────────
  step(6, 'Creating a test Voucher (requires 10 points, 20% off)…');

  const POINTS_REQUIRED = 10;
  const voucher = await runAsTenant(() =>
    import('../services/voucher.service').then(({ voucherService }) =>
      voucherService.createVoucher(restaurant.id, {
        code: `TESTV${Date.now()}`,
        title: 'Test Voucher',
        discountValue: 20,
        discountType: 'percentage',
        pointsRequired: POINTS_REQUIRED,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
        quantity: 5,
        isActive: true,
      })
    )
  );

  info('Voucher created', {
    id: voucher.id,
    code: voucher.code,
    pointsRequired: voucher.pointsRequired,
    quantity: voucher.quantity,
  });
  assert(!!voucher.id, 'Voucher created in tenant DB');
  assert(voucher.quantity === 5, 'Voucher initial quantity = 5');

  // ── STEP 7: Redeem the Voucher ────────────────────────────────────────────
  step(7, `Redeeming Voucher (requires ${POINTS_REQUIRED} pts; user has ${balanceAfter} pts)…`);

  const pointsBeforeRedeem = balanceAfter;

  const userVoucher = await runAsTenant(() =>
    import('../services/voucher.service').then(({ voucherService }) =>
      voucherService.redeemVoucher(userId, voucher.id)
    )
  );

  info('UserVoucher created', {
    id: userVoucher.id,
    isUsed: userVoucher.isUsed,
    voucherId: userVoucher.voucherId,
  });
  assert(!!userVoucher.id, 'UserVoucher record created');
  assert(!userVoucher.isUsed, 'UserVoucher.isUsed = false (redeemed but not yet used)');

  // Check points deducted centrally
  const pointsAfterRedeem = await centralPrisma.userLoyaltyPoint.findUnique({
    where: { userId_restaurantId: { userId, restaurantId: restaurant.id } },
  });
  info('Central points after redeem', pointsAfterRedeem?.points);
  assert(
    pointsAfterRedeem?.points === pointsBeforeRedeem - POINTS_REQUIRED,
    `Central points deducted by ${POINTS_REQUIRED} (${pointsBeforeRedeem} → ${pointsAfterRedeem?.points})`
  );

  // Check voucher quantity decremented
  const voucherAfter = await runAsTenant(() =>
    tenantPrisma.voucher.findUnique({ where: { id: voucher.id } })
  );
  info('Voucher quantity after redeem', voucherAfter?.quantity);
  assert(voucherAfter?.quantity === 4, 'Voucher quantity decremented from 5 → 4');

  // Check REDEEM PointsTransaction
  const redeemTx = await runAsTenant(() =>
    tenantPrisma.pointsTransaction.findFirst({
      where: { customerId, type: 'REDEEM' },
      orderBy: { createdAt: 'desc' },
    })
  );
  info('PointsTransaction (REDEEM)', redeemTx ? { id: redeemTx.id, points: redeemTx.points } : null);
  assert(!!redeemTx, 'REDEEM PointsTransaction recorded in tenant DB');
  assert(redeemTx?.points === -POINTS_REQUIRED, `Redeem tx points = -${POINTS_REQUIRED}`);

  // ── STEP 8: Insufficient points guard ────────────────────────────────────
  step(8, 'Guard: Attempting to redeem when points are insufficient…');

  // Create a voucher requiring way more points than user has
  const expensiveVoucher = await runAsTenant(() =>
    tenantPrisma.voucher.create({
      data: {
        restaurantId: restaurant.id,
        code: `EXPV${Date.now()}`,
        title: 'Expensive Test Voucher',
        discountValue: new Prisma.Decimal(99),
        discountType: 'percentage',
        pointsRequired: 99999,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        quantity: 10,
        isActive: true,
      },
    })
  );

  let redeemError: string | null = null;
  try {
    await runAsTenant(() =>
      import('../services/voucher.service').then(({ voucherService }) =>
        voucherService.redeemVoucher(userId, expensiveVoucher.id)
      )
    );
  } catch (e: any) {
    redeemError = e.message;
    info('Expected error caught', redeemError);
  }
  assert(redeemError !== null, 'Insufficient points error thrown correctly');
  assert(
    redeemError?.includes('không đủ điểm') ?? false,
    'Error message is user-friendly'
  );

  // ── STEP 9: getUserLoyaltyPoints summary ──────────────────────────────────
  step(9, 'Fetching full loyalty points summary via getUserLoyaltyPoints()…');

  const { loyaltyService } = await import('../services/loyalty.service');
  const summary = await loyaltyService.getUserLoyaltyPoints(userId);
  info('Loyalty summary', summary);
  assert(summary.length > 0, 'Loyalty summary returned at least 1 restaurant entry');
  const thisRestaurant = summary.find(s => s.restaurantId === restaurant.id);
  assert(!!thisRestaurant, `Entry found for restaurant "${restaurant.name}"`);
  assert(
    thisRestaurant?.points === pointsBeforeRedeem - POINTS_REQUIRED,
    `Summary shows correct final balance (${thisRestaurant?.points} pts)`
  );

  // ── STEP 10: Cleanup ──────────────────────────────────────────────────────
  step(10, 'Cleaning up test data…');

  // Remove UserVouchers → PointsTransactions → Order → Vouchers → (central: UserLoyaltyPoint)
  await runAsTenant(async () => {
    await tenantPrisma.userVoucher.deleteMany({ where: { userId } });
    await tenantPrisma.pointsTransaction.deleteMany({ where: { customerId } });
    await tenantPrisma.order.delete({ where: { id: testOrder.id } });
    await tenantPrisma.voucher.deleteMany({ where: { restaurantId: restaurant.id, code: { startsWith: 'TESTV' } } });
    await tenantPrisma.voucher.deleteMany({ where: { restaurantId: restaurant.id, code: { startsWith: 'EXPV' } } });
  });

  await centralPrisma.userLoyaltyPoint.deleteMany({
    where: { userId, restaurantId: restaurant.id },
  });

  log('All test data removed.');
  pass('Cleanup complete.');
  passed++;

  // ── Final report ──────────────────────────────────────────────────────────
  separator();
  console.log(`\n${BOLD}  Test Results${RESET}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}   ${failed > 0 ? RED : GREEN}Failed: ${failed}${RESET}\n`);

  if (failed === 0) {
    console.log(`${BOLD}${GREEN}  🎉 All tests passed! Loyalty system is working correctly.${RESET}\n`);
  } else {
    console.log(`${BOLD}${RED}  ❌ Some tests failed. Check the output above.${RESET}\n`);
  }

  await centralPrisma.$disconnect();
  await tenantPrisma.$disconnect();
}

main().catch((e) => {
  console.error(`\n${RED}[FATAL ERROR]${RESET}`, e);
  process.exit(1);
});
