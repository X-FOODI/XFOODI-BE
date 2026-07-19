import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTables() {
  const xeko = await prisma.restaurant.findFirst({
    where: { slug: 'xeko' },
  });

  if (!xeko) {
    console.log('❌ Quán Xeko không tồn tại');
    return;
  }

  const tables = await prisma.table.findMany({
    where: { restaurantId: xeko.id },
    include: { floor: true },
    orderBy: { code: 'asc' },
  });

  console.log(`\n📋 Quán ${xeko.name} có ${tables.length} bàn:\n`);

  for (const table of tables) {
    const menuUrl = `http://xeko.localhost:3000/menu/${table.id}`;
    console.log(`🪑 Bàn ${table.code} (${table.floor.name}):`);
    console.log(`   Menu URL: ${menuUrl}\n`);
  }

  if (tables.length > 0) {
    console.log(`\n💡 Thử vào URL này để xem menu:`);
    console.log(`   ${`http://xeko.localhost:3000/menu/${tables[0].id}`}\n`);
  }
}

checkTables()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
