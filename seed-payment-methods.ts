import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const methods = [
    { code: 'CASH', name: 'Tiền mặt' },
    { code: 'BANK_TRANSFER', name: 'Chuyển khoản' },
  ];

  for (const m of methods) {
    const existing = await prisma.paymentMethod.findFirst({ where: { code: m.code } });
    if (existing) {
      console.log(`${m.code} already exists: ${existing.id}`);
    } else {
      const created = await prisma.paymentMethod.create({
        data: { code: m.code, name: m.name, isActive: true },
      });
      console.log(`Created ${m.code}: ${created.id}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
