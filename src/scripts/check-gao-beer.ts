import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const r = await prisma.restaurant.findFirst({
    where: { name: { contains: 'Gạo' } },
    select: { id: true, name: true, metadata: true }
  });
  console.log(JSON.stringify(r, null, 2));
  await prisma.$disconnect();
}
check();
