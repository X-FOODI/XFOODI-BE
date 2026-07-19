/**
 * Migration Script: Add loyaltyPointRate column to all tenant Restaurants tables.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-add-loyalty-rate-to-tenants.ts
 */
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl } from '../lib/prisma';
import { ENV } from '../config/env';

async function run() {
  console.log('[Migration] Fetching all active restaurants from central DB...');
  const restaurants = await centralPrisma.restaurant.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, loyaltyPointRate: true },
  });

  console.log(`[Migration] Found ${restaurants.length} restaurant(s). Processing...`);

  for (const r of restaurants) {
    const schemaName = `tenant_${r.slug}`;
    const tenantDbUrl = getTenantConnectionUrl(ENV.DATABASE_URL, r.slug);
    const tenantPrisma = getTenantPrisma(tenantDbUrl);

    try {
      // Add column if it does not exist (idempotent)
      await tenantPrisma.$executeRawUnsafe(`
        ALTER TABLE "${schemaName}"."Restaurants"
        ADD COLUMN IF NOT EXISTS "loyaltyPointRate" INTEGER NOT NULL DEFAULT 10000;
      `);

      // Set the value from central DB
      await tenantPrisma.$executeRawUnsafe(`
        UPDATE "${schemaName}"."Restaurants"
        SET "loyaltyPointRate" = $1
        WHERE "id" = $2;
      `, r.loyaltyPointRate ?? 10000, r.id);

      console.log(`[Migration] ✅ tenant_${r.slug}: loyaltyPointRate = ${r.loyaltyPointRate}`);
    } catch (err: any) {
      console.error(`[Migration] ❌ tenant_${r.slug}: ${err.message}`);
    }
  }

  console.log('[Migration] Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[Migration] Fatal error:', err);
  process.exit(1);
});
