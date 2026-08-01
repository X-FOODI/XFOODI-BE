import { Queue, Worker, Job } from 'bullmq';
import { ENV } from '../config/env';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';
import { loyaltyService } from './loyalty.service';

/**
 * BullMQ queue cho hậu-xử-lý đơn hàng (bất đồng bộ, giảm nghẽn request).
 * - Job COMPLETE: cộng điểm loyalty (việc nặng) → tách khỏi luồng cập nhật trạng thái.
 * - Idempotent: jobId = `complete:<orderId>` → BullMQ tự dedupe.
 * - Retry + backoff khi lỗi tạm thời (DB/Gemini timeout).
 * - Fallback inline nếu Redis/BullMQ không khả dụng (không làm mất việc).
 * - Worker chạy nền nên MẤT tenant context → phải tự dựng lại tenant client.
 */

const redisUrl = ENV.REDIS_URL || 'redis://localhost:6379';
const connection = { url: redisUrl, connectTimeout: 5000, maxRetriesPerRequest: null } as any;

let queue: InstanceType<typeof Queue> | null = null;
let worker: InstanceType<typeof Worker> | null = null;
let active = false;

/** Chạy hậu-xử-lý trong đúng tenant schema (worker nền không có request context). */
async function runOrderCompletion(orderId: string, restaurantId: string): Promise<void> {
  const task = async () => {
    await loyaltyService.calculateAndRewardPoints(orderId);
  };
  const rest = await centralPrisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
  if (rest?.slug && rest.slug !== 'system') {
    const tp = getTenantPrisma(getTenantConnectionUrl(ENV.DATABASE_URL, rest.slug));
    await prismaStorage.run(tp, task);
  } else {
    await task();
  }
}

export function initOrderQueue(): void {
  try {
    queue = new Queue('order-completion', { connection });
    worker = new Worker(
      'order-completion',
      async (job: Job) => {
        await runOrderCompletion(job.data.orderId, job.data.restaurantId);
      },
      { connection },
    );
    worker.on('failed', (job: Job | undefined, err: Error) => console.error(`[OrderQueue] Job ${job?.id} failed:`, err?.message));
    active = true;
    console.log('[OrderQueue] BullMQ order-completion đã khởi tạo.');
  } catch (e: any) {
    console.warn('[OrderQueue] BullMQ init lỗi, dùng inline fallback:', e?.message);
    active = false;
  }
}

/** Đẩy job hậu-xử-lý khi đơn COMPLETED. */
export async function enqueueOrderCompletion(orderId: string, restaurantId: string): Promise<void> {
  if (active && queue) {
    try {
      await queue.add(
        'complete',
        { orderId, restaurantId },
        {
          jobId: `complete:${orderId}`, // idempotent — chống xử lý trùng
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      return;
    } catch (e: any) {
      console.warn('[OrderQueue] enqueue lỗi, chạy inline:', e?.message);
    }
  }
  // Fallback: chạy trực tiếp (best-effort)
  runOrderCompletion(orderId, restaurantId).catch((e) =>
    console.warn('[OrderQueue] inline completion lỗi:', e?.message),
  );
}
