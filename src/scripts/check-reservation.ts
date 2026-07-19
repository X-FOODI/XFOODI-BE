import { PrismaClient } from '@prisma/client';
import { prismaStorage, getTenantPrisma, getTenantConnectionUrl } from '../lib/prisma';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function check() {
  const r = await prisma.restaurant.findFirst({
    where: { name: { contains: 'Gạo' } },
    select: { id: true, name: true, slug: true }
  });
  if (!r) {
    console.log('No restaurant');
    return;
  }
  const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', r.slug);
  const tenantPrisma = getTenantPrisma(tenantDbUrl);

  const res = await tenantPrisma.reservation.findFirst({
    where: { confirmationCode: '788A95' },
    select: { id: true, confirmationCode: true, depositAmount: true, createdAt: true }
  });
  console.log(JSON.stringify(res, null, 2));
  await prisma.$disconnect();
}
check();
