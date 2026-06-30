import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function seed() {
  let u = await p.user.findFirst({ where: { email: 'customer1@example.com' } });
  if (!u) {
    u = await p.user.create({
      data: {
        email: 'customer1@example.com',
        fullName: 'Nguyen Van A',
        passwordHash: 'dummy',
        isActive: true
      }
    });
  }

  for (let i = 1; i <= 5; i++) {
    await p.restaurantApplication.create({
      data: {
        userId: u.id,
        restaurantName: 'Nhà Hàng M?u ' + i + ' - ' + Date.now().toString().slice(-4),
        slug: 'nhahangmau-' + i + '-' + Date.now().toString().slice(-4),
        address: i + '00 Ðu?ng Test, Qu?n ' + i,
        phone: '090123456' + i,
        email: 'contact' + i + '@test.com',
        description: 'Mô t? nhà hàng m?u ' + i,
        status: i % 2 === 0 ? 'APPROVED' : (i === 3 ? 'REJECTED' : 'PENDING'),
        cuisineType: 'vietnamese'
      }
    });
  }
  console.log('Successfully seeded 5 applications!');
}
seed().finally(() => p.$disconnect());
