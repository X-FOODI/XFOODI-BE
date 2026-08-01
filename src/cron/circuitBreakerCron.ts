import cron from 'node-cron';
import { recoverAutoModules } from '../middlewares/moduleMaintenance';

/** Half-open recovery: mỗi 1 phút thử mở lại các module do breaker tự bật (sau cooldown). */
export function startCircuitBreakerCron(): void {
  cron.schedule('*/1 * * * *', async () => {
    try {
      await recoverAutoModules();
    } catch (e: any) {
      console.error('[CircuitBreaker] recovery uncaught:', e?.message);
    }
  });
  console.log('[CircuitBreaker] Half-open recovery cron đã bật (mỗi 1 phút)');
}
