import cron from 'node-cron';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';
import { reservationService } from '../services/reservation.service';
import { sendReservationReminderEmail, sendReservationCancellationEmail } from '../lib/email';
import { PaymentStatus, PaymentPurpose } from '../enums/payment.enum';

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

// ── No-Show Check Job — runs every 1 minute ──────────────────────────────────
// Finds CONFIRMED reservations whose time is older than 30 minutes from now,
// not checked-in yet, and flags them for staff attention.

async function runNoShowCheckJob(): Promise<void> {
  console.log('[NoShowCheckJob] Running...');
  let flagged = 0;
  try {
    const activeRestaurants = await centralPrisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, metadata: true },
    });
    for (const restaurant of activeRestaurants) {
      try {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);
        await prismaStorage.run(tenantPrisma, async () => {
          const now = new Date();
          const metadata = (restaurant.metadata as any) ?? {};
          const config = metadata.reservationConfig ?? {};
          const lateCheckinMinutes = config.late_checkin_minutes ?? 30;
          const noShowTime = new Date(now.getTime() - lateCheckinMinutes * 60 * 1000);

          const lateReservations = await tenantPrisma.reservation.findMany({
            where: {
              restaurantId: restaurant.id,
              time: { lt: noShowTime },
              statusValue: { code: 'CONFIRMED' },
              checkedInAt: null,
            },
            include: {
              customer: { include: { user: { select: { fullName: true } } } },
            },
          });

          for (const res of lateReservations) {
            const existingMeta: any = (res as any).metadata ?? {};
            
            // Skip if manual cancellation review is pending
            if (existingMeta.isCancellationManualReviewPending === true) {
              continue;
            }

            // Skip if already resolved or flagged
            if (existingMeta.noShowAutoPending === true || existingMeta.noShowResolved === true) {
              continue;
            }

            // Flag as noShowAutoPending
            await tenantPrisma.reservation.update({
              where: { id: res.id },
              data: {
                metadata: {
                  ...existingMeta,
                  noShowAutoPending: true,
                },
              },
            });

            flagged++;

            // Emit socket event to notify staff dashboard
            try {
              const { getIO } = await import('../socket');
              getIO().to(`restaurant_${restaurant.id}`).emit('RESERVATION_LATE_30MIN', {
                reservationId: res.id,
                confirmationCode: res.confirmationCode ?? '',
                customerName: res.customer?.user?.fullName ?? 'Khách vãng lai',
              });
            } catch { /* socket optional */ }
          }
        });
      } catch (err: any) {
        console.error(`[NoShowCheckJob] Tenant ${restaurant.slug}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[NoShowCheckJob] Fatal:', err?.message);
  }
  console.log(`[NoShowCheckJob] Done. Flagged: ${flagged}`);
}

// ── Deposit Confirmation Timeout Job — runs every 1 minute ───────────────────
// Finds PENDING reservations with completed deposit payments that have exceeded
// deposit_confirmation_timeout_minutes without owner confirmation, and auto-cancels + refunds them.
async function runDepositTimeoutJob(): Promise<void> {
  console.log('[DepositTimeoutJob] Running...');
  let cancelled = 0;
  try {
    const activeRestaurants = await centralPrisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, metadata: true },
    });
    for (const restaurant of activeRestaurants) {
      try {
        const tenantDbUrl = getTenantConnectionUrl(process.env.DATABASE_URL ?? '', restaurant.slug);
        const tenantPrisma = getTenantPrisma(tenantDbUrl);
        await prismaStorage.run(tenantPrisma, async () => {
          const now = new Date();
          const metadata = (restaurant.metadata as any) ?? {};
          const config = metadata.reservationConfig ?? {};
          const timeoutMinutes = config.deposit_confirmation_timeout_minutes ?? 120;
          const timeoutMs = timeoutMinutes * 60 * 1000;

          // Find pending reservations with completed deposit payments
          const reservations = await tenantPrisma.reservation.findMany({
            where: {
              restaurantId: restaurant.id,
              statusValue: { code: 'PENDING' },
              depositAmount: { gt: 0 },
              payments: {
                some: {
                  status: PaymentStatus.COMPLETED,
                  purpose: PaymentPurpose.DEPOSIT,
                }
              }
            },
            include: {
              payments: {
                where: { status: PaymentStatus.COMPLETED, purpose: PaymentPurpose.DEPOSIT },
                orderBy: { paymentDate: 'desc' }
              },
              customer: { include: { user: { select: { email: true } } } },
            }
          });

          for (const res of reservations) {
            const completedPayment = res.payments[0];
            if (!completedPayment) continue;

            const paymentDate = new Date(completedPayment.paymentDate);
            if (now.getTime() - paymentDate.getTime() > timeoutMs) {
              try {
                // Auto-cancel with 100% refund (isStaff=true, approveReview=true)
                await reservationService.cancel(
                  res.id,
                  'SYSTEM',
                  true,
                  true,
                  `Tự động hủy do hết thời hạn xác nhận đặt cọc (${timeoutMinutes} phút)`
                );

                cancelled++;

                // Emit socket event to notify staff dashboard
                try {
                  const { getIO } = await import('../socket');
                  getIO().to(`restaurant_${restaurant.id}`).emit('RESERVATION_AUTO_CANCELLED', {
                    reservationId: res.id,
                    reason: `Deposit confirmation timeout of ${timeoutMinutes}m exceeded`,
                  });
                } catch { /* socket optional */ }
              } catch (cancelErr: any) {
                console.error(`[DepositTimeoutJob] Failed to cancel reservation ${res.id}:`, cancelErr?.message);
              }
            }
          }
        });
      } catch (err: any) {
        console.error(`[DepositTimeoutJob] Tenant ${restaurant.slug}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[DepositTimeoutJob] Fatal:', err?.message);
  }
  console.log(`[DepositTimeoutJob] Done. Cancelled: ${cancelled}`);
}

// ── Export: start all reservation cron jobs ───────────────────────────────────
export function startReservationCronJobs(): void {
  // Reminder job: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try { await runReminderJob(); }
    catch (e: any) { console.error('[ReminderJob] Uncaught:', e?.message); }
  });

  // Payment deadline enforcement: every 1 minute
  cron.schedule('*/1 * * * *', async () => {
    try { await runDeadlineJob(); }
    catch (e: any) { console.error('[DeadlineJob] Uncaught:', e?.message); }
  });

  // Deposit confirmation timeout job: every 1 minute
  cron.schedule('*/1 * * * *', async () => {
    try { await runDepositTimeoutJob(); }
    catch (e: any) { console.error('[DepositTimeoutJob] Uncaught:', e?.message); }
  });

  // No-show flag job: every 1 minute
  cron.schedule('*/1 * * * *', async () => {
    try { await runNoShowCheckJob(); }
    catch (e: any) { console.error('[NoShowCheckJob] Uncaught:', e?.message); }
  });

  console.log('[CronJobs] Reservation cron jobs started (reminder: */15, deadline: */1, deposit-timeout: */1, no-show: */1)');
}
