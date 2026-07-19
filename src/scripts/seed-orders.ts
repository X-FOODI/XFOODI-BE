/**
 * Seed đơn hàng đa dạng để tính năng "Thường được gọi kèm" / AI Recommendations có dữ liệu đẹp.
 *
 * Chạy:  pnpm ts-node --skip-project --compiler-options "{\"module\":\"commonjs\",\"esModuleInterop\":true,\"strict\":false}" src/scripts/seed-orders.ts [restaurantSlug] [soLuongDon]
 *
 * - Không truyền slug: tự chọn nhà hàng có nhiều món active nhất.
 * - Mặc định tạo 60 đơn, phân bổ theo các "combo mẫu" để tạo tương quan đồng xuất hiện.
 */
import { ENV } from '../config/env';
import {
  centralPrisma,
  getTenantPrisma,
  getTenantConnectionUrl,
} from '../lib/prisma';
import { PrismaClient, Prisma } from '@prisma/client';

const ORDER_STATUSES = [
  { code: 'PENDING', name: 'Chờ xác nhận', colorCode: '#f1c40f', isDefault: true },
  { code: 'CONFIRMED', name: 'Đã xác nhận', colorCode: '#3498db', isDefault: false },
  { code: 'PREPARING', name: 'Đang chế biến', colorCode: '#e67e22', isDefault: false },
  { code: 'READY', name: 'Sẵn sàng phục vụ', colorCode: '#9b59b6', isDefault: false },
  { code: 'COMPLETED', name: 'Hoàn thành', colorCode: '#2ecc71', isDefault: false },
  { code: 'CANCELLED', name: 'Đã hủy', colorCode: '#95a5a6', isDefault: false },
];

async function ensureStatusMap(tprisma: PrismaClient, typeCode: string, defs: typeof ORDER_STATUSES) {
  let st = await tprisma.statusType.findUnique({ where: { code: typeCode } });
  if (!st) st = await tprisma.statusType.create({ data: { code: typeCode } });
  const map: Record<string, string> = {};
  for (const s of defs) {
    let v = await tprisma.statusValue.findFirst({ where: { statusTypeId: st.id, code: s.code } });
    if (!v) {
      v = await tprisma.statusValue.create({
        data: { statusTypeId: st.id, code: s.code, name: s.name, colorCode: s.colorCode, isDefault: s.isDefault, isSystem: true },
      });
    }
    map[s.code] = v.id;
  }
  return map;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const MENU: { category: string; dishes: { name: string; price: number; desc: string; veg?: boolean; spicy?: boolean; best?: boolean }[] }[] = [
  {
    category: 'Món chính',
    dishes: [
      { name: 'Cơm tấm sườn bì chả', price: 55000, desc: 'Sườn nướng, bì, chả trứng ăn kèm cơm tấm.', best: true },
      { name: 'Phở bò tái nạm', price: 60000, desc: 'Phở bò truyền thống nước dùng đậm đà.', best: true },
      { name: 'Bún chả Hà Nội', price: 50000, desc: 'Chả nướng than hoa, bún và rau sống.' },
      { name: 'Gà nướng muối ớt', price: 120000, desc: 'Nửa con gà nướng thơm lừng.', spicy: true },
      { name: 'Lẩu thái hải sản', price: 250000, desc: 'Lẩu chua cay hải sản tươi.', spicy: true, best: true },
    ],
  },
  {
    category: 'Khai vị',
    dishes: [
      { name: 'Gỏi cuốn tôm thịt', price: 35000, desc: 'Gỏi cuốn tươi mát chấm mắm nêm.', veg: false },
      { name: 'Chả giò hải sản', price: 45000, desc: 'Chả giò giòn rụm nhân hải sản.' },
      { name: 'Salad rau trộn', price: 40000, desc: 'Rau tươi trộn sốt mè rang.', veg: true },
      { name: 'Khoai tây chiên', price: 30000, desc: 'Khoai tây chiên giòn ăn kèm sốt.', veg: true },
    ],
  },
  {
    category: 'Đồ uống',
    dishes: [
      { name: 'Bia Gạo tươi', price: 25000, desc: 'Bia thủ công nhà nấu, mát lạnh.', best: true },
      { name: 'Trà đào cam sả', price: 35000, desc: 'Trà đào thanh mát hương sả.', veg: true },
      { name: 'Nước ép cam', price: 30000, desc: 'Cam vắt nguyên chất.', veg: true },
      { name: 'Cà phê sữa đá', price: 25000, desc: 'Cà phê phin truyền thống.', veg: true },
    ],
  },
  {
    category: 'Tráng miệng',
    dishes: [
      { name: 'Chè khúc bạch', price: 30000, desc: 'Chè thanh mát topping hạnh nhân.', veg: true },
      { name: 'Bánh flan', price: 20000, desc: 'Bánh flan mềm mịn caramel.', veg: true },
    ],
  },
];

/** Seed categories + dishes vào tenant schema nếu menu còn nghèo. */
async function seedMenu(tprisma: PrismaClient, restaurantId: string): Promise<void> {
  for (const cat of MENU) {
    let category = await tprisma.category.findFirst({ where: { restaurantId, name: cat.category } });
    if (!category) {
      category = await tprisma.category.create({
        data: { restaurantId, name: cat.category, description: cat.category, isActive: true },
      });
    }
    for (const d of cat.dishes) {
      const exists = await tprisma.dish.findFirst({ where: { restaurantId, name: d.name } });
      if (exists) continue;
      await tprisma.dish.create({
        data: {
          restaurantId,
          categoryId: category.id,
          name: d.name,
          description: d.desc,
          price: new Prisma.Decimal(d.price),
          unit: 'phần',
          imageUrl: `https://picsum.photos/seed/${encodeURIComponent(d.name)}/400/300`,
          isVegetarian: !!d.veg,
          isSpicy: !!d.spicy,
          isBestSeller: !!d.best,
          isActive: true,
        },
      });
    }
  }
}

async function main() {
  const slugArg = process.argv[2];
  const count = parseInt(process.argv[3] || '60', 10);

  // 1. Chọn nhà hàng
  const restaurants = await centralPrisma.restaurant.findMany({ select: { id: true, slug: true, name: true } });
  if (restaurants.length === 0) throw new Error('Không có nhà hàng nào trong hệ thống.');

  let target: { id: string; slug: string; name: string } | null = null;
  let targetDishes: any[] = [];

  const candidates = slugArg ? restaurants.filter((r) => r.slug === slugArg) : restaurants;
  if (slugArg && candidates.length === 0) throw new Error(`Không tìm thấy nhà hàng slug="${slugArg}"`);

  for (const r of candidates) {
    if (r.slug === 'system') continue; // bỏ nhà hàng hệ thống
    const url = getTenantConnectionUrl(ENV.DATABASE_URL, r.slug);
    const tp = getTenantPrisma(url);
    try {
      const dishes = await tp.dish.findMany({
        where: { restaurantId: r.id, isActive: true },
        select: { id: true, name: true, price: true },
      });
      if (!target || dishes.length > targetDishes.length) {
        target = r;
        targetDishes = dishes;
      }
      if (slugArg) break;
    } catch (e: any) {
      console.warn(`  ⚠️  Bỏ qua ${r.slug}: ${e.message}`);
    }
  }

  if (!target) {
    throw new Error('Không tìm được nhà hàng phù hợp (khác "system") để seed.');
  }

  const url = getTenantConnectionUrl(ENV.DATABASE_URL, target.slug);
  const tprisma = getTenantPrisma(url);

  // Seed menu nếu còn nghèo (<8 món), rồi tải lại danh sách món
  if (targetDishes.length < 8) {
    console.log(`🧑‍🍳 Menu chỉ có ${targetDishes.length} món — seed thêm thực đơn mẫu...`);
    await seedMenu(tprisma, target.id);
    targetDishes = await tprisma.dish.findMany({
      where: { restaurantId: target.id, isActive: true },
      select: { id: true, name: true, price: true },
    });
  }

  console.log(`🍽️  Nhà hàng: ${target.name} (${target.slug}) — ${targetDishes.length} món active`);

  // 2. Đảm bảo status tồn tại
  const orderStatusMap = await ensureStatusMap(tprisma, 'ORDER', ORDER_STATUSES);
  const itemStatusMap = await ensureStatusMap(tprisma, 'ORDER_DETAIL', [
    { code: 'PENDING', name: 'Chờ làm', colorCode: '#f39c12', isDefault: true },
    { code: 'COOKING', name: 'Đang làm', colorCode: '#3498db', isDefault: false },
    { code: 'COMPLETED', name: 'Hoàn thành', colorCode: '#2ecc71', isDefault: false },
    { code: 'SERVED', name: 'Đã phục vụ', colorCode: '#27ae60', isDefault: false },
    { code: 'CANCELLED', name: 'Đã hủy', colorCode: '#95a5a6', isDefault: false },
  ]);

  // 3. Xây "combo mẫu" bằng chỉ số món (modulo để an toàn với số lượng bất kỳ) → tạo tương quan
  const N = targetDishes.length;
  const idx = (i: number) => targetDishes[i % N];
  const templates: number[][] = [
    [0, 1, 5],
    [0, 2],
    [1, 3, 6],
    [2, 4, 5],
    [0, 1],
    [3, 7, 8],
    [1, 5, 9],
    [2, 3],
    [4, 6, 7],
    [0, 8],
  ];

  // Phân bổ status: đa số COMPLETED (để FBT có dữ liệu), phần còn lại rải khắp pipeline
  const statusPool = [
    'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED',
    'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED',
  ];

  let created = 0;
  for (let i = 0; i < count; i++) {
    const template = pick(templates);
    // Chọn các món theo template + đôi khi thêm 1 món ngẫu nhiên
    const chosenIdx = new Set<number>(template);
    if (Math.random() < 0.4) chosenIdx.add(Math.floor(Math.random() * N));

    const items = Array.from(chosenIdx).map((ti) => {
      const dish = idx(ti);
      return { dish, quantity: 1 + Math.floor(Math.random() * 3) };
    });

    const statusCode = pick(statusPool);
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date(Date.now() - daysAgo * 86400_000 - Math.floor(Math.random() * 86400_000));

    const subTotal = items.reduce((s, it) => s + Number(it.dish.price) * it.quantity, 0);
    const taxAmount = subTotal * 0.1;
    const totalAmount = subTotal + taxAmount;
    const seq = (i + 1).toString().padStart(4, '0');
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    const reference = `SEED-${createdAt.toISOString().slice(2, 10).replace(/-/g, '')}-${seq}-${suffix}`;

    const itemStatus =
      statusCode === 'COMPLETED' ? 'SERVED' :
      statusCode === 'READY' ? 'COMPLETED' :
      statusCode === 'PREPARING' || statusCode === 'CONFIRMED' ? 'COOKING' :
      statusCode === 'CANCELLED' ? 'CANCELLED' : 'PENDING';

    await tprisma.order.create({
      data: {
        reference,
        restaurantId: target.id,
        orderStatusId: orderStatusMap[statusCode],
        subTotal: new Prisma.Decimal(subTotal),
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(taxAmount),
        serviceCharge: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(totalAmount),
        createdAt,
        updatedAt: createdAt,
        orderDetails: {
          create: items.map((it) => ({
            dishId: it.dish.id,
            quantity: it.quantity,
            unitPrice: new Prisma.Decimal(Number(it.dish.price)),
            itemStatusId: itemStatusMap[itemStatus],
          })),
        },
      },
    });
    created++;
  }

  console.log(`✅ Đã tạo ${created} đơn hàng seed (reference bắt đầu bằng "SEED-").`);
  console.log(`   Restaurant ID: ${target.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed thất bại:', e);
    process.exit(1);
  })
  .finally(async () => {
    await centralPrisma.$disconnect();
  });
