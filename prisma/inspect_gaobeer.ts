import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📦 Inspecting dishes in tenant_gao-beer:');
  const dishes: any[] = await prisma.$queryRawUnsafe(
    `SELECT d.id, d.name, d.price, c.name as category_name FROM "tenant_gao-beer"."Dishes" d LEFT JOIN "tenant_gao-beer"."Categories" c ON d."categoryId" = c.id`
  );
  console.log(dishes);
}

main().finally(() => prisma.$disconnect());
