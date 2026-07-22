import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedXeko() {
  console.log('🌱 Seed quán Xeko...\n');

  // 1. Find or create Xeko restaurant
  let xeko = await prisma.restaurant.findFirst({
    where: { slug: 'xeko' },
  });

  if (!xeko) {
    console.log('❌ Quán Xeko không tồn tại. Tạo mới...');
    
    // Create owner user for Xeko
    const hashedPassword = await bcrypt.hash('xeko123', 10);
    const owner = await prisma.user.upsert({
      where: { email: 'owner@xeko.com' },
      update: {},
      create: {
        email: 'owner@xeko.com',
        userName: 'xeko_owner',
        passwordHash: hashedPassword,
        fullName: 'Xeko Owner',
        emailVerified: true,
        isActive: true,
      },
    });

    xeko = await prisma.restaurant.create({
      data: {
        name: 'Quán Xeko',
        slug: 'xeko',
        ownerId: owner.id,
        description: 'Quán cháo & món ăn ngon',
        address: '123 Nguyễn Văn Linh, TP.HCM',
        phone: '0909123456',
        email: 'xeko@restaurant.com',
        isActive: true,
        planType: 'FREE',
      },
    });
    console.log(`✅ Quán Xeko đã tạo: ${xeko.name}`);
  } else {
    console.log(`✅ Quán Xeko đã tồn tại: ${xeko.name}`);
  }

  // 2. Create categories
  const categories = [
    { name: 'Cháo', description: 'Các món cháo đặc biệt' },
    { name: 'Món chính', description: 'Các món ăn chính' },
    { name: 'Món phụ', description: 'Món ăn kèm' },
    { name: 'Đồ uống', description: 'Nước giải khát' },
  ];

  const createdCategories: any[] = [];
  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: { id: `${xeko.id}-${cat.name}` },
      update: {},
      create: {
        name: cat.name,
        description: cat.description,
        restaurantId: xeko.id,
        isActive: true,
        displayOrder: createdCategories.length + 1,
      },
    });
    createdCategories.push(category);
  }
  console.log(`✅ Đã tạo ${createdCategories.length} danh mục`);

  // 3. Create dishes
  const dishes = [
    // Cháo
    { categoryIdx: 0, name: 'Cháo gà', price: 35000, description: 'Cháo gà thơm ngon', isVegetarian: false, isBestSeller: true },
    { categoryIdx: 0, name: 'Cháo lòng', price: 40000, description: 'Cháo lòng đặc biệt', isVegetarian: false, isBestSeller: true },
    { categoryIdx: 0, name: 'Cháo sườn', price: 45000, description: 'Cháo sườn nấu rau củ', isVegetarian: false, isBestSeller: false },
    { categoryIdx: 0, name: 'Cháo hải sản', price: 50000, description: 'Cháo tôm mực ngon', isVegetarian: false, isBestSeller: true },
    
    // Món chính
    { categoryIdx: 1, name: 'Cơm gà xối mỡ', price: 45000, description: 'Cơm gà Hải Nam thơm ngon', isVegetarian: false, isBestSeller: true },
    { categoryIdx: 1, name: 'Phở bò', price: 50000, description: 'Phở bò truyền thống', isVegetarian: false, isBestSeller: false },
    { categoryIdx: 1, name: 'Bún bò Huế', price: 45000, description: 'Bún bò cay nồng', isVegetarian: false, isBestSeller: false },
    { categoryIdx: 1, name: 'Mì xào hải sản', price: 55000, description: 'Mì xào tôm mực', isVegetarian: false, isBestSeller: false },
    
    // Món phụ
    { categoryIdx: 2, name: 'Chả giò', price: 25000, description: 'Chả giò rế miền Nam', isVegetarian: false, isBestSeller: false },
    { categoryIdx: 2, name: 'Gỏi cuốn', price: 20000, description: 'Gỏi cuốn tươi', isVegetarian: true, isBestSeller: false },
    { categoryIdx: 2, name: 'Xúc xích chiên', price: 30000, description: 'Xúc xích giòn tan', isVegetarian: false, isBestSeller: false },
    
    // Đồ uống
    { categoryIdx: 3, name: 'Trà đá', price: 5000, description: 'Trá đá tươi mát', isVegetarian: true, isBestSeller: false },
    { categoryIdx: 3, name: 'Nước ngọt', price: 15000, description: 'Coca, Pepsi, 7Up', isVegetarian: true, isBestSeller: false },
    { categoryIdx: 3, name: 'Nước chanh', price: 20000, description: 'Chanh tươi vắt', isVegetarian: true, isBestSeller: false },
    { categoryIdx: 3, name: 'Trà sữa', price: 35000, description: 'Trà sữa trân châu', isVegetarian: true, isBestSeller: true },
  ];

  for (const dish of dishes) {
    await prisma.dish.create({
      data: {
        name: dish.name,
        description: dish.description,
        price: dish.price,
        unit: 'Phần',
        categoryId: createdCategories[dish.categoryIdx].id,
        restaurantId: xeko.id,
        isVegetarian: dish.isVegetarian,
        isBestSeller: dish.isBestSeller,
        isActive: true,
      },
    });
  }
  console.log(`✅ Đã tạo ${dishes.length} món ăn`);

  // 4. Create floors & tables
  const floor = await prisma.floor.create({
    data: {
      name: 'Tầng 1',
      restaurantId: xeko.id,
      isActive: true,
      height: 1500,
      width: 1500,
    },
  });

  const statusType = await prisma.statusType.findFirst({
    where: { code: 'TABLE_STATUS' },
  });

  if (!statusType) {
    throw new Error('TABLE_STATUS type not found');
  }

  const availableStatus = await prisma.statusValue.findFirst({
    where: { statusTypeId: statusType.id, code: 'AVAILABLE' },
  });

  if (!availableStatus) {
    throw new Error('AVAILABLE status not found');
  }

  // Create 10 tables
  for (let i = 1; i <= 10; i++) {
    await prisma.table.create({
      data: {
        code: `B${String(i).padStart(2, '0')}`,
        type: 'SQUARE',
        seatingCapacity: i % 3 === 0 ? 6 : 4,
        shape: 'RECTANGLE',
        positionX: 100 + (i % 5) * 150,
        positionY: 100 + Math.floor(i / 5) * 150,
        width: 100,
        height: 100,
        rotation: 0,
        floorId: floor.id,
        restaurantId: xeko.id,
        tableStatusId: availableStatus.id,
        isActive: true,
      },
    });
  }
  console.log(`✅ Đã tạo 10 bàn ăn`);

  console.log('\n✅ Seed quán Xeko hoàn tất!');
  console.log(`\nThông tin đăng nhập (nếu tạo mới):`);
  console.log(`  Email: owner@xeko.com`);
  console.log(`  Password: xeko123`);
}

seedXeko()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
