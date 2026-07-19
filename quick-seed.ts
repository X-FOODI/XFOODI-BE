import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function quickSeed() {
  console.log('🌱 Quick seed started...\n');

  // 1. Create Admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@xfoodi.com' },
    update: {},
    create: {
      email: 'admin@xfoodi.com',
      userName: 'admin',
      passwordHash: hashedPassword,
      fullName: 'System Admin',
      emailVerified: true,
      isActive: true,
    },
  });
  console.log(`✅ Admin user: ${admin.email}`);

  // 2. Create Admin role
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin' },
  });

  // 3. Assign Admin role
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });
  console.log(`✅ Admin role assigned`);

  // 4. Create Owner user
  const owner = await prisma.user.upsert({
    where: { email: 'owner@xfoodi.com' },
    update: {},
    create: {
      email: 'owner@xfoodi.com',
      userName: 'owner',
      passwordHash: hashedPassword,
      fullName: 'Restaurant Owner',
      emailVerified: true,
      isActive: true,
    },
  });
  console.log(`✅ Owner user: ${owner.email}`);

  // 5. Create Owner role
  const ownerRole = await prisma.role.upsert({
    where: { name: 'Owner' },
    update: {},
    create: { name: 'Owner' },
  });

  // 6. Create demo restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo-restaurant' },
    update: {},
    create: {
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      ownerId: owner.id,
      description: 'Restaurant demo cho testing',
      address: '123 Demo Street, HCM',
      phone: '0909123456',
      email: 'demo@restaurant.com',
      isActive: true,
      planType: 'FREE',
    },
  });
  console.log(`✅ Restaurant: ${restaurant.name}`);

  // 7. Assign Owner role to restaurant
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: owner.id, roleId: ownerRole.id, restaurantId: restaurant.id },
  });

  // 8. Create Customer role
  await prisma.role.upsert({
    where: { name: 'Customer' },
    update: {},
    create: { name: 'Customer' },
  });

  // 9. Create payment methods
  await prisma.paymentMethod.upsert({
    where: { code: 'CASH' },
    update: {},
    create: { code: 'CASH', name: 'Tiền mặt', isActive: true },
  });

  await prisma.paymentMethod.upsert({
    where: { code: 'BANK_TRANSFER' },
    update: {},
    create: { code: 'BANK_TRANSFER', name: 'Chuyển khoản', isActive: true },
  });
  console.log(`✅ Payment methods created`);

  // 10. Create floor & table
  const floor = await prisma.floor.create({
    data: {
      name: 'Tầng 1',
      restaurantId: restaurant.id,
      isActive: true,
      height: 1000,
      width: 1000,
    },
  });

  const statusType = await prisma.statusType.upsert({
    where: { code: 'TABLE_STATUS' },
    update: {},
    create: { code: 'TABLE_STATUS' },
  });

  const availableStatus = await prisma.statusValue.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      statusTypeId: statusType.id,
      code: 'AVAILABLE',
      name: 'Trống',
      colorCode: '#22c55e',
      isDefault: true,
    },
  });

  await prisma.table.create({
    data: {
      code: 'B01',
      type: 'SQUARE',
      seatingCapacity: 4,
      shape: 'RECTANGLE',
      positionX: 100,
      positionY: 100,
      width: 100,
      height: 100,
      rotation: 0,
      floorId: floor.id,
      restaurantId: restaurant.id,
      tableStatusId: availableStatus.id,
      isActive: true,
    },
  });
  console.log(`✅ Floor & Table created`);

  console.log('\n✅ Quick seed completed!');
  console.log('\nLogin credentials:');
  console.log('  Admin: admin@xfoodi.com / admin123');
  console.log('  Owner: owner@xfoodi.com / admin123');
}

quickSeed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
