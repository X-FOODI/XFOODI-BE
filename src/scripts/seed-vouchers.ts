import { centralPrisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

async function main() {
  const future = (d: number) => new Date(Date.now() + d * 86400_000);
  const rest = await centralPrisma.restaurant.findFirst({ where: { slug: 'gao-beer' }, select: { id: true } });

  const platform = [
    { code: 'XFOODI50K', title: 'Giảm 50K toàn sàn', description: 'Áp dụng cho mọi nhà hàng XFoodi', discountType: 'fixed', discountValue: 50000, pointsRequired: 100, quantity: 500, applicableService: 'all' },
    { code: 'XFOODI15', title: 'Giảm 15% đơn đầu tiên', description: 'Khách mới toàn nền tảng', discountType: 'percentage', discountValue: 15, pointsRequired: 0, quantity: 1000, applicableService: 'all' },
    { code: 'FREESHIP', title: 'Miễn phí giao hàng', description: 'Đơn từ 100K', discountType: 'fixed', discountValue: 25000, pointsRequired: 50, quantity: 300, applicableService: 'shop' },
  ];
  const owner = rest ? [
    { code: 'GAOBEER10', title: 'Gạo Beer giảm 10%', description: 'Khuyến mãi riêng Gạo Beer', discountType: 'percentage', discountValue: 10, pointsRequired: 0, quantity: 200, applicableService: 'all', restaurantId: rest.id },
    { code: 'GAOBEER30K', title: 'Giảm 30K tại Gạo Beer', description: 'Đơn từ 200K', discountType: 'fixed', discountValue: 30000, pointsRequired: 80, quantity: 150, applicableService: 'booking', restaurantId: rest.id },
  ] : [];

  let n = 0;
  for (const v of [...platform, ...owner]) {
    const rid = (v as any).restaurantId ?? null;
    const exists = await centralPrisma.voucher.findFirst({ where: { code: v.code, restaurantId: rid } });
    if (exists) continue;
    await centralPrisma.voucher.create({
      data: {
        restaurantId: rid,
        code: v.code, title: v.title, description: v.description,
        discountType: v.discountType, discountValue: new Prisma.Decimal(v.discountValue),
        pointsRequired: v.pointsRequired, quantity: v.quantity,
        applicableService: v.applicableService, distributionMode: 'public',
        status: 'active', isActive: true, expiryDate: future(60),
      },
    });
    n++;
  }
  const plat = await centralPrisma.voucher.count({ where: { restaurantId: null } });
  const own = await centralPrisma.voucher.count({ where: { restaurantId: { not: null } } });
  console.log(`Seeded ${n} vouchers | platform total=${plat} owner total=${own}`);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); }).finally(() => centralPrisma.$disconnect());
