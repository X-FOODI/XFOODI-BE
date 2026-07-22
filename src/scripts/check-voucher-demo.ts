import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find restaurant by slug
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: 'xeko' },
    select: { id: true, name: true, slug: true }
  });
  console.log('\n=== RESTAURANT ===');
  console.log(JSON.stringify(restaurant, null, 2));

  if (!restaurant) {
    console.log('Restaurant not found! Checking all restaurants...');
    const all = await prisma.restaurant.findMany({ select: { id: true, name: true, slug: true }, take: 10 });
    console.log(JSON.stringify(all, null, 2));
    await prisma.$disconnect();
    return;
  }

  // Find tables in the tenant database
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prismaHelper = require('../lib/prisma');
  const tenantUrl = prismaHelper.getTenantConnectionUrl(process.env.DATABASE_URL || '', restaurant.slug);
  const tenantPrisma = prismaHelper.getTenantPrisma(tenantUrl);

  const tables = await tenantPrisma.table.findMany({
    select: { id: true, code: true, floor: { select: { name: true } } },
    orderBy: { code: 'asc' }
  });
  console.log('\n=== ALL TABLES IN TENANT SCHEMA ===');
  tables.forEach((t: any) => console.log(`  code=${t.code}  id=${t.id}  floor=${t.floor?.name}`));

  // Find existing active vouchers for this restaurant
  const vouchers = await prisma.voucher.findMany({
    where: {
      OR: [
        { restaurantId: restaurant.id },
        { restaurantId: null }
      ],
      isActive: true,
      status: 'active',
      expiryDate: { gt: new Date() }
    },
    select: { id: true, code: true, title: true, discountType: true, discountValue: true, pointsRequired: true },
    take: 5
  });
  console.log('\n=== ACTIVE VOUCHERS ===');
  console.log(JSON.stringify(vouchers, null, 2));

  // Find users who might be customers (look for users with UserVouchers)
  const usersWithVouchers = await prisma.userVoucher.findMany({
    include: { user: { select: { id: true, email: true, fullName: true } } },
    take: 3
  });
  console.log('\n=== USERS WITH VOUCHERS ===');
  console.log(JSON.stringify(usersWithVouchers.map(uv => ({ userId: uv.userId, ...uv.user, isUsed: uv.isUsed, voucherId: uv.voucherId })), null, 2));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
