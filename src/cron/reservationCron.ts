import cron from 'node-cron';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';
import { reservationService } from '../services/reservation.service';
import { sendReservationReminderEmail, sendReservationCancellationEmail } from '../lib/email';

// ── Reminder Job — runs every 15 minutes ──────────────────────────────────────
// Finds CONFIRMED reservations whose time is 105–135 minutes from now
// with reminderSentAt = null, and sends reminder emails.

async function runReminderJob(): Promise<void> {
  console.log('[ReminderJob] Running...');
  let sent = 0, failed = 0;
  try {
    const activeRestaurants = await centralPrisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
    });
    for (const restaurant of activeRestaurants) {
      try {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);
        await prismaStorage.run(tenantPrisma, async () => {
          const now = new Date();
          const from = new Date(now.getTime() + 105 * 60 * 1000);
          const to   = new Date(now.getTime() + 135 * 60 * 1000);

          const reservations = await tenantPrisma.reservation.findMany({
            where: {
              restaurantId: restaurant.id,
              reminderSentAt: null,
              time: { gte: from, lte: to },
              statusValue: { code: 'CONFIRMED' },
            },
            include: {
              statusValue: { select: { code: true } },
              customer: { include: { user: { select: { email: true } } } },
              tables: { include: { table: { select: { code: true } } } },
            },
          });

          for (const res of reservations) {
            if (res.statusValue?.code === 'CANCELLED') continue;
            const email = res.customer?.user?.email;
            if (!email) continue;
            try {
              await sendReservationReminderEmail(email, {
                restaurantName: restaurant.name,
                confirmationCode: res.confirmationCode ?? '',
                numberOfGuests: res.numberOfGuests,
                time: res.time.toISOString(),
                depositAmount: Number(res.depositAmount ?? 0),
                tableAssignments: res.tables.map((t: any) => t.table?.code).filter(Boolean),
              }, res.id);
              await tenantPrisma.reservation.update({ where: { id: res.id }, data: { reminderSentAt: new Date() } });
              sent++;
            } catch (emailErr: any) {
              failed++;
              console.error(`[ReminderJob] Email failed for reservation ${res.id}:`, emailErr?.message);
              const existingMeta: any = (res as any).metadata ?? {};
              const retries: any[] = existingMeta.reminderRetries ?? [];
              retries.push({ attempt: retries.length + 1, failedAt: new Date().toISOString() });
              const updatedMeta = retries.length >= 2
                ? { ...existingMeta, reminderRetries: retries, reminderFailed: true }
                : { ...existingMeta, reminderRetries: retries };
              await tenantPrisma.reservation.update({ where: { id: res.id }, data: { metadata: updatedMeta } }).catch(() => {});
            }
          }
        });
      } catch (err: any) {
        console.error(`[ReminderJob] Tenant ${restaurant.slug}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[ReminderJob] Fatal:', err?.message);
  }
  console.log(`[ReminderJob] Done. Sent: ${sent}, Failed: ${failed}`);
}

// ── Deadline Job — runs every 5 minutes ──────────────────────────────────────
// Finds PENDING reservations whose paymentDeadline has passed and auto-cancels them.

async function runDeadlineJob(): Promise<void> {
  console.log('[DeadlineJob] Running...');
  let cancelled = 0;
  try {
    const activeRestaurants = await centralPrisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
    });
    for (const restaurant of activeRestaurants) {
      try {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);
        await prismaStorage.run(tenantPrisma, async () => {
          const now = new Date();
          const overdueReservations = await tenantPrisma.reservation.findMany({
            where: {
              restaurantId: restaurant.id,
              paymentDeadline: { not: null, lt: now },
              statusValue: { code: 'PENDING' },
            },
            include: {
              customer: { include: { user: { select: { email: true } } } },
            },
          });

          for (const res of overdueReservations) {
            try {
              // Cancel via reservationService (updates status + statusHistory)
              await reservationService.cancel(res.id, 'SYSTEM');

              // Append cancellationInfo to metadata
              const existingMeta: any = (res as any).metadata ?? {};
              await tenantPrisma.reservation.update({
                where: { id: res.id },
                data: {
                  metadata: {
                    ...existingMeta,
                    cancellationInfo: {
                      cancelledReason: 'Payment deadline exceeded',
                      at: now.toISOString(),
                    },
                  },
                },
              }).catch(() => {});

              cancelled++;

              // Send cancellation email non-blocking
              const email = res.customer?.user?.email;
              if (email) {
                sendReservationCancellationEmail(email, {
                  restaurantName: restaurant.name,
                  confirmationCode: res.confirmationCode ?? '',
                  numberOfGuests: res.numberOfGuests,
                  time: res.time.toISOString(),
                  depositAmount: Number(res.depositAmount ?? 0),
                  cancelledAt: now.toISOString(),
                }, res.id).catch((e: any) => console.error(`[DeadlineJob] Email ${res.id}:`, e?.message));
              }

              // Emit RESERVATION_AUTO_CANCELLED socket event
              try {
                const { getIO } = await import('../socket');
                getIO().to(`restaurant_${restaurant.id}`).emit('RESERVATION_AUTO_CANCELLED', {
                  reservationId: res.id,
                  reason: 'Payment deadline exceeded',
                });
              } catch { /* socket optional */ }

            } catch (cancelErr: any) {
              console.error(`[DeadlineJob] Failed to cancel reservation ${res.id}:`, cancelErr?.message);
            }
          }
        });
      } catch (err: any) {
        console.error(`[DeadlineJob] Tenant ${restaurant.slug}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[DeadlineJob] Fatal:', err?.message);
  }
  console.log(`[DeadlineJob] Done. Cancelled: ${cancelled}`);
}

// ── Export: start all reservation cron jobs ───────────────────────────────────
export function startReservationCronJobs(): void {
  // Reminder job: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try { await runReminderJob(); }
    catch (e: any) { console.error('[ReminderJob] Uncaught:', e?.message); }
  });

  // Payment deadline enforcement: every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try { await runDeadlineJob(); }
    catch (e: any) { console.error('[DeadlineJob] Uncaught:', e?.message); }
  });

  console.log('[CronJobs] Reservation cron jobs started (reminder: */15, deadline: */5)');
}
