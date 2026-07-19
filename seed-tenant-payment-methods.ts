import { centralPrisma, getTenantConnectionUrl, getTenantPrisma } from './src/lib/prisma';
import { prismaStorage } from './src/lib/prisma';

async function main() {
  const baseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  const restaurants = await centralPrisma.restaurant.findMany({
    select: { id: true, slug: true, name: true },
  });

  for (const r of restaurants) {
    const tenantUrl = getTenantConnectionUrl(baseUrl, r.slug);
    const tenantPrisma = getTenantPrisma(tenantUrl);

    await prismaStorage.run(tenantPrisma, async () => {
      // Check if PaymentMethods table exists in this tenant
      const tableCheck = await tenantPrisma.$queryRaw<any[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = ${`tenant_${r.slug}`}
          AND table_name = 'PaymentMethods'
        ) as exists
      `;

      if (!tableCheck[0]?.exists) {
        console.log(`${r.slug}: PaymentMethods table doesn't exist, skipping`);
        return;
      }

      // Check existing
      const existing = await tenantPrisma.$queryRaw<any[]>`
        SELECT code FROM "PaymentMethods"
      `;
      console.log(`${r.slug}: existing methods =`, existing.map((e: any) => e.code));

      // Get actual columns
      const cols = await tenantPrisma.$queryRaw<any[]>`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = ${`tenant_${r.slug}`} AND table_name = 'PaymentMethods'
      `;
      console.log(`  columns:`, cols.map((c: any) => c.column_name));

      // Upsert CASH
      const cashExists = existing.some((e: any) => e.code === 'CASH');
      if (!cashExists) {
        await tenantPrisma.$executeRawUnsafe(
          `INSERT INTO "PaymentMethods" ("id", "code", "name", "isActive", "createdAt") VALUES (gen_random_uuid()::text, 'CASH', 'Tiền mặt', true, NOW())`
        );
        console.log(`  ✅ ${r.slug}: Created CASH`);
      } else {
        console.log(`  ✓ ${r.slug}: CASH exists`);
      }

      const bankExists = existing.some((e: any) => e.code === 'BANK_TRANSFER');
      if (!bankExists) {
        await tenantPrisma.$executeRawUnsafe(
          `INSERT INTO "PaymentMethods" ("id", "code", "name", "isActive", "createdAt") VALUES (gen_random_uuid()::text, 'BANK_TRANSFER', 'Chuyển khoản', true, NOW())`
        );
        console.log(`  ✅ ${r.slug}: Created BANK_TRANSFER`);
      } else {
        console.log(`  ✓ ${r.slug}: BANK_TRANSFER exists`);
      }
    });
  }

  await centralPrisma.$disconnect();
  console.log('Done!');
}

main().catch(console.error);
