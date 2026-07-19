import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const MENU_TEMPLATE = [
  {
    categoryName: 'Khai Vị',
    description: 'Món ăn mở đầu vị giác đậm đà hương vị truyền thống',
    displayOrder: 1,
    dishes: [
      {
        name: 'Gỏi Cuốn Tôm Thịt',
        description: 'Tôm tươi, thịt ba chỉ, bún và rau sống cuốn bánh tráng, chấm mắm nêm đậm đà',
        price: 45000,
        unit: 'Dĩa (4 cuốn)',
        imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Chả Giò Hải Sản Giòn Rụm',
        description: 'Chả giò nhân tôm mực hải sản tươi ngon chiên giòn ăn kèm sốt mayonnaise',
        price: 65000,
        unit: 'Dĩa (6 cuốn)',
        imageUrl: 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Salad Rau Mầm Cá Hồi',
        description: 'Rau mầm tươi mát kết hợp cá hồi sốt passion fruit thơm thanh',
        price: 85000,
        unit: 'Phần',
        imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80',
        isBestSeller: false,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Khoai Tây Chiên Bơ Tỏi',
        description: 'Khoai tây giòn béo ngậy sốt bơ tỏi thơm lừng',
        price: 45000,
        unit: 'Dĩa',
        imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&q=80',
        isBestSeller: false,
        isVegetarian: true,
        isSpicy: false,
      },
    ],
  },
  {
    categoryName: 'Món Chính',
    description: 'Các món ăn chính đậm đà phong cách ẩm thực Việt Nam',
    displayOrder: 2,
    dishes: [
      {
        name: 'Phở Bò Tái Lăn Hà Nội',
        description: 'Bò tơ tươi xào tái gừng tỏi, nước dùng ninh xương 12 tiếng ngọt thanh',
        price: 75000,
        unit: 'Tô đặc biệt',
        imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Bún Chả Hà Nội Than Hoa',
        description: 'Thịt chả nướng than hoa thơm nức, ăn kèm nước mắm đu đủ chua ngọt',
        price: 65000,
        unit: 'Phần',
        imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Cơm Tấm Sườn Bì Chả Đặc Biệt',
        description: 'Sườn nướng mật ong mềm mọng, chả trứng hấp béo ngậy và bì giòn sần sật',
        price: 70000,
        unit: 'Dĩa',
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Bò Lúc Lắc Sốt Tiêu Đen',
        description: 'Bò Úc xào lúc lắc mềm ngon cùng ớt chuông và hành tây nướng',
        price: 185000,
        unit: 'Dĩa',
        imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
        isBestSeller: false,
        isVegetarian: false,
        isSpicy: true,
      },
      {
        name: 'Gà Nướng Mật Ong Nguyên Con',
        description: 'Gà ta thả vườn nướng mật ong rừng vàng giòn tẩm vị đậm đà',
        price: 260000,
        unit: 'Con',
        imageUrl: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&q=80',
        isBestSeller: false,
        isVegetarian: false,
        isSpicy: false,
      },
    ],
  },
  {
    categoryName: 'Lẩu & Hải Sản',
    description: 'Các món lẩu nghi ngút khói và hải sản tươi sống chọn lọc',
    displayOrder: 3,
    dishes: [
      {
        name: 'Lẩu Thái Hải Sản Chùa Vàng',
        description: 'Nước lẩu chua cay đậm đà với tôm càng, mực ống, nghêu và nấm tươi',
        price: 290000,
        unit: 'Nồi (2-3 người)',
        imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: true,
      },
      {
        name: 'Tôm Hùm Sốt Bơ Tỏi',
        description: 'Tôm hùm bông tươi sống sốt bơ tỏi nướng phô mai béo ngậy',
        price: 450000,
        unit: 'Phần (500g)',
        imageUrl: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=600&q=80',
        isBestSeller: true,
        isVegetarian: false,
        isSpicy: false,
      },
      {
        name: 'Mực Trứng Nướng Sa Tế',
        description: 'Mực trứng thơm cay giòn sần sật tẩm sa tế ớt hiểm',
        price: 165000,
        unit: 'Dĩa',
        imageUrl: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&q=80',
        isBestSeller: false,
        isVegetarian: false,
        isSpicy: true,
      },
    ],
  },
  {
    categoryName: 'Đồ Uống',
    description: 'Bia tươi mát lạnh, trà trái cây và thức uống giải khát',
    displayOrder: 4,
    dishes: [
      {
        name: 'Bia Gạo Tươi XFoodi',
        description: 'Bia gạo ủ lên men tự nhiên mát lạnh, vị ngọt dịu nhẹ sảng khoái',
        price: 28000,
        unit: 'Ly 500ml',
        imageUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80',
        isBestSeller: true,
        isVegetarian: true,
        isSpicy: false,
      },
      {
        name: 'Trà Đào Cam Sả Thượng Hạng',
        description: 'Trà đen hảo hạng quyện hương đào giòn ngọt và cam sả thơm lừng',
        price: 38000,
        unit: 'Ly',
        imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80',
        isBestSeller: true,
        isVegetarian: true,
        isSpicy: false,
      },
      {
        name: 'Cà Phê Sữa Đá Sài Gòn',
        description: 'Cà phê Espresso rang đậm đà đậm chất béo ngọt đậm vị',
        price: 29000,
        unit: 'Ly',
        imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&q=80',
        isBestSeller: false,
        isVegetarian: true,
        isSpicy: false,
      },
      {
        name: 'Nước Ép Dưa Hấu Nguyên Chất',
        description: 'Dưa hấu tươi mát ép nguyên chất 100% không đường',
        price: 35000,
        unit: 'Ly',
        imageUrl: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=600&q=80',
        isBestSeller: false,
        isVegetarian: true,
        isSpicy: false,
      },
    ],
  },
  {
    categoryName: 'Tráng Miệng',
    description: 'Chè tươi ngọt mát và bánh ngọt làm thủ công trong ngày',
    displayOrder: 5,
    dishes: [
      {
        name: 'Chè Khúc Bạch Trái Cây',
        description: 'Khúc bạch phô mai mềm mịn ăn kèm nhãn xuồng và hạnh nhân sấy',
        price: 35000,
        unit: 'Chén',
        imageUrl: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&q=80',
        isBestSeller: true,
        isVegetarian: true,
        isSpicy: false,
      },
      {
        name: 'Bánh Flan Caramen Sữa Dừa',
        description: 'Bánh flan mềm mịn đắng nhẹ vị caramen dừa béo béo',
        price: 25000,
        unit: 'Cái',
        imageUrl: 'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?w=600&q=80',
        isBestSeller: false,
        isVegetarian: true,
        isSpicy: false,
      },
    ],
  },
];

async function main() {
  console.log('🌱 Bắt đầu seed Nhà hàng & Thực đơn phong phú đầy đủ...\n');

  // 1. Lấy Owner User ID
  const ownerUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'thihtktk03@gmail.com' },
        { email: 'xfoodiprojects@gmail.com' },
      ],
    },
  });

  if (!ownerUser) {
    console.error('❌ Không tìm thấy User Owner.');
    process.exit(1);
  }

  const ownerId = ownerUser.id;

  // 2. Danh sách Nhà hàng cần tạo trong public schema
  const restaurantsToSeed = [
    {
      name: 'Gạo Beer & BBQ',
      slug: 'gao-beer',
      description: 'Nhà hàng bia gạo tươi & nướng lẩu nức tiếng',
      address: '123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      phone: '0901234567',
      email: 'contact@gaobeer.com',
      cuisineType: 'vietnamese',
      primaryColor: '#FF5A2C',
    },
    {
      name: 'Nhà Hàng Đại Việt',
      slug: 'nha-hang-dai-viet',
      description: 'Tinh hoa ẩm thực 3 miền Việt Nam sang trọng',
      address: '456 Phố Hàng Bông, Quận Hoàn Kiếm, Hà Nội',
      phone: '0907654321',
      email: 'daiviet@xfoodi.website',
      cuisineType: 'vietnamese',
      primaryColor: '#D4A76A',
    },
    {
      name: 'Tiệm Cháo Xeko',
      slug: 'tiem-chao-xeko',
      description: 'Cháo sườn bách thảo & món ăn dinh dưỡng gia đình',
      address: '789 Đường Lê Văn Sỹ, Quận 3, TP. Hồ Chí Minh',
      phone: '0908889999',
      email: 'xeko@xfoodi.website',
      cuisineType: 'vietnamese',
      primaryColor: '#22C55E',
    },
    {
      name: 'Demo XFoodi Restaurant',
      slug: 'demo',
      description: 'Nhà hàng mẫu chuẩn XFoodi cho dùng thử',
      address: '100 Đường Trần Hưng Đạo, Quận 1, TP. Hồ Chí Minh',
      phone: '0903334444',
      email: 'demo@xfoodi.website',
      cuisineType: 'other',
      primaryColor: '#FF380B',
    },
  ];

  for (const rData of restaurantsToSeed) {
    console.log(`\n================================------------------`);
    console.log(`🏪 Khởi tạo nhà hàng: ${rData.name} (slug: ${rData.slug})...`);

    let restaurant = await prisma.restaurant.findUnique({
      where: { slug: rData.slug },
    });

    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          name: rData.name,
          slug: rData.slug,
          ownerId: ownerId,
          description: rData.description,
          address: rData.address,
          phone: rData.phone,
          email: rData.email,
          cuisineType: rData.cuisineType,
          primaryColor: rData.primaryColor,
          isActive: true,
          planType: 'PRO',
        },
      });
      console.log(`  ✅ Đã tạo trong public.Restaurants (ID: ${restaurant.id})`);
    } else {
      console.log(`  ℹ️  Nhà hàng đã có trong public.Restaurants (ID: ${restaurant.id})`);
    }

    const schemaName = `tenant_${rData.slug}`;

    // Tạo Schema tenant nếu chưa có
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    console.log(`  🛠️ Schema "${schemaName}" đã sẵn sàng.`);

    // Drop FK constraints on tenant Categories & Dishes if any exist to allow flexible NULLs
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${schemaName}"."Categories" DROP CONSTRAINT IF EXISTS "Categories_restaurantId_fkey"`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "${schemaName}"."Dishes" DROP CONSTRAINT IF EXISTS "Dishes_restaurantId_fkey"`);
    } catch (_) {}

    // Drop and recreate tables cleanly to avoid schema mismatch
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."Categories" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "restaurantId" TEXT,
        "imageUrl" TEXT,
        "parentId" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "createdBy" TEXT,
        "modifiedBy" TEXT,
        "metadata" JSONB,
        "displayOrder" INTEGER NOT NULL DEFAULT 0
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."Dishes" (
        "id" TEXT PRIMARY KEY,
        "categoryId" TEXT NOT NULL,
        "restaurantId" TEXT,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "price" DECIMAL(18,2) NOT NULL,
        "unit" TEXT NOT NULL DEFAULT 'Phần',
        "isVegetarian" BOOLEAN NOT NULL DEFAULT false,
        "isSpicy" BOOLEAN NOT NULL DEFAULT false,
        "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "autoDisableByStock" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "createdBy" TEXT,
        "modifiedBy" TEXT,
        "metadata" JSONB,
        "imageUrl" TEXT
      );
    `);

    // Seed Menu Categories & Dishes with explicit column list
    for (const catData of MENU_TEMPLATE) {
      const existingCat: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM "${schemaName}"."Categories" WHERE name = $1 LIMIT 1`,
        catData.categoryName
      );

      let catId: string;
      if (existingCat.length > 0) {
        catId = existingCat[0].id;
      } else {
        catId = randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."Categories" (
            "id", "name", "description", "restaurantId", "imageUrl", "parentId", "isActive", "createdAt", "updatedAt", "displayOrder"
          ) VALUES ($1, $2, $3, $4, NULL, NULL, true, NOW(), NOW(), $5)`,
          catId, catData.categoryName, catData.description, restaurant.id, catData.displayOrder
        );
        console.log(`  + Đã thêm Danh mục: ${catData.categoryName}`);
      }

      for (const dish of catData.dishes) {
        const existingDish: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${schemaName}"."Dishes" WHERE name = $1 AND "categoryId" = $2 LIMIT 1`,
          dish.name, catId
        );

        if (existingDish.length === 0) {
          const dishId = randomUUID();
          await prisma.$executeRawUnsafe(
            `INSERT INTO "${schemaName}"."Dishes" (
              "id", "categoryId", "restaurantId", "name", "description", "price", "unit",
              "isVegetarian", "isSpicy", "isBestSeller", "isActive", "autoDisableByStock",
              "createdAt", "updatedAt", "imageUrl"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, false, NOW(), NOW(), $11)`,
            dishId, catId, restaurant.id, dish.name, dish.description, dish.price, dish.unit,
            dish.isVegetarian, dish.isSpicy, dish.isBestSeller, dish.imageUrl
          );
          console.log(`    * Đã thêm Món ăn: ${dish.name} (${dish.price.toLocaleString('vi-VN')}₫)`);
        }
      }
    }
  }

  console.log(`\n==================================================`);
  console.log(`🎉 HOÀN THÀNH SEED TOÀN BỘ MENU VÀ NHÀ HÀNG!`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi seed menu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
