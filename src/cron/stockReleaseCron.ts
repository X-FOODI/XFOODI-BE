import cron from 'node-cron';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';
import { releaseStockForOrder } from '../services/inventory.service';

// Đơn "bỏ quên" quá thời gian này (phút) mà chưa thanh toán → tự hoàn kho + hủy.
const TTL_MINUTES = Number(process.env.ORDER_RESERVATION_TTL_MIN || 120);

async function runStockReleaseJob(): Promise<void> {
  const restaurants = await centralPrisma.restaurant.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  const cutoff = new Date(Date.now() - TTL_MINUTES * 60_000);

  for (const r of restaurants) {
    if (r.slug === 'system') continue;
    try {
      const tenantPrisma = getTenantPrisma(getTenantConnectionUrl(process.env.DATABASE_URL ?? '', r.slug));
      await prismaStorage.run(tenantPrisma, async () => {
        const p: any = tenantPrisma;

        // Lấy id trạng thái PENDING & CANCELLED của loại ORDER
        const statuses = await p.statusValue.findMany({
          where: { statusType: { code: 'ORDER' }, code: { in: ['PENDING', 'CANCELLED'] } },
          select: { id: true, code: true },
        });
        const pendingId = statuses.find((s: any) => s.code === 'PENDING')?.id;
        const cancelledId = statuses.find((s: any) => s.code === 'CANCELLED')?.id;
        if (!pendingId || !cancelledId) return;

        // Đơn quá hạn: đang PENDING, tạo trước cutoff, CHƯA có thanh toán hoàn tất
        const stale = await p.order.findMany({
          where: {
            orderStatusId: pendingId,
            createdAt: { lt: cutoff },
            payments: { none: { status: 1 } },
          },
          select: { id: true },
          take: 200,
        });

        for (const o of stale) {
          // Hoàn kho đã giữ (no-op nếu đơn không reserve gì)
          await releaseStockForOrder(o.id).catch((e: any) =>
            console.warn(`[StockReleaseJob] release ${o.id} lỗi:`, e?.message),
          );
          // Đặt CANCELLED trực tiếp (KHÔNG qua updateOrderStatus → tránh release 2 lần)
          await p.order.update({
            where: { id: o.id },
            data: { orderStatusId: cancelledId, cancelledAt: new Date() },
          });
        }

        if (stale.length > 0) {
          console.log(`[StockReleaseJob] ${r.slug}: hoàn kho + hủy ${stale.length} đơn quá hạn (>${TTL_MINUTES}p)`);
        }
      });
    } catch (err: any) {
      console.error(`[StockReleaseJob] Tenant ${r.slug}:`, err?.message);
    }
  }
}

export function startStockReleaseCron(): void {
  // Chạy mỗi 15 phút
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runStockReleaseJob();
    } catch (e: any) {
      console.error('[StockReleaseJob] Uncaught:', e?.message);
    }
  });
  console.log(`[StockReleaseJob] Cron đã bật (mỗi 15 phút, TTL ${TTL_MINUTES} phút)`);
}
