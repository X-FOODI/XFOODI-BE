import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const catCols: any[] = await prisma.$queryRawUnsafe(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'tenant_gao-beer' AND table_name = 'Categories'`
  );
  console.log('Categories Columns:', catCols);

  const dishCols: any[] = await prisma.$queryRawUnsafe(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'tenant_gao-beer' AND table_name = 'Dishes'`
  );
  console.log('\nDishes Columns:', dishCols);
}

main().finally(() => prisma.$disconnect());
