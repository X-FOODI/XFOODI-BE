import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function seedBankInfo() {
  const bankInfo = {
    bankCode: 'MB',
    accountNumber: '0949064234',
    accountName: 'CHU TAI KHOAN',
  };

  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true, metadata: true } });
  console.log(`Found ${restaurants.length} restaurants`);

  for (const restaurant of restaurants) {
    const existingMeta = (restaurant.metadata as any) ?? {};
    const newMeta = { ...existingMeta, bankInfo };
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { metadata: newMeta },
    });
    console.log(`✅ Updated bankInfo for: ${restaurant.name}`);
  }

  console.log('Done!');
  await prisma.$disconnect();
}

seedBankInfo().catch((e) => { console.error(e); process.exit(1); });
