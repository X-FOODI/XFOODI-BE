import { PrismaClient } from '@prisma/client';
import { centralPrisma } from '../../src/lib/prisma'; // Wait, centralPrisma imports from '../../src/lib/prisma' but let's query directly or use simple prisma client

const prisma = new PrismaClient();

async function main() {
  // Query restaurant owned by owner
  const owner = await prisma.user.findUnique({
    where: { email: 'trunganh222@gmail.com' },
    include: {
      ownedRestaurants: true
    }
  });

  console.log('OWNER INFO:', {
    email: owner?.email,
    restaurants: owner?.ownedRestaurants.map(r => ({ id: r.id, name: r.name, slug: r.slug }))
  });

  // Query customer vouchers
  const customer = await prisma.user.findUnique({
    where: { email: 'thihtktk@gmail.com' }
  });

  if (customer) {
    const userVouchers = await prisma.$queryRawUnsafe(`SELECT * FROM public."UserVouchers" WHERE "userId" = $1`, customer.id);
    console.log('USER VOUCHERS:', userVouchers);
    const voucherIds = (userVouchers as any[]).map(uv => uv.voucherId);
    const vouchers = await prisma.$queryRawUnsafe(`SELECT * FROM public."Vouchers" WHERE "id" = ANY($1)`, voucherIds);
    console.log('VOUCHER DETAILS:', vouchers);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
