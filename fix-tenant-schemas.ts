/**
 * Fix tenant schemas: enable vector extension + create RestaurantWallets table
 * Run: npx ts-node fix-tenant-schemas.ts
 */
import { centralPrisma, getTenantConnectionUrl, getTenantPrisma } from './src/lib/prisma';
import { prismaStorage } from './src/lib/prisma';

async function main() {
  const baseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  if (!baseUrl) throw new Error('DATABASE_URL not set');

  const restaurants = await centralPrisma.restaurant.findMany({
    select: { id: true, slug: true, name: true },
  });

  console.log(`Found ${restaurants.length} restaurants\n`);

  for (const r of restaurants) {
    const tenantUrl = getTenantConnectionUrl(baseUrl, r.slug);
    const tenantPrisma = getTenantPrisma(tenantUrl);

    console.log(`Processing: ${r.slug} (${r.name})`);

    try {
      await prismaStorage.run(tenantPrisma, async () => {
        // Check if RestaurantWallets exists
        const tableExists = await tenantPrisma.$queryRaw<any[]>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = ${`tenant_${r.slug}`}
            AND table_name = 'RestaurantWallets'
          ) as exists
        `;

        if (!tableExists[0]?.exists) {
          // Create RestaurantWallets table directly via SQL
          await tenantPrisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "RestaurantWallets" (
              "id" TEXT NOT NULL,
              "restaurantId" TEXT NOT NULL,
              "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
              "totalEarned" DECIMAL(65,30) NOT NULL DEFAULT 0,
              "totalWithdrawn" DECIMAL(65,30) NOT NULL DEFAULT 0,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "RestaurantWallets_pkey" PRIMARY KEY ("id")
            )
          `);
          await tenantPrisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantWallets_restaurantId_key" 
            ON "RestaurantWallets"("restaurantId")
          `);
          console.log(`  ✅ Created RestaurantWallets`);
        } else {
          console.log(`  ✓ RestaurantWallets already exists`);
        }

        // Add missing columns to Payments table
        try {
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "refundId" TEXT`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3)`);
          // RestaurantWallets missing columns
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "RestaurantWallets" ADD COLUMN IF NOT EXISTS "lifetimeEarned" DECIMAL(18,2) NOT NULL DEFAULT 0`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "RestaurantWallets" ADD COLUMN IF NOT EXISTS "cashBalance" DECIMAL(18,2) NOT NULL DEFAULT 0`);
          // WalletTransactions missing columns
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "WalletTransactions" ADD COLUMN IF NOT EXISTS "orderId" TEXT`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "WalletTransactions" ADD COLUMN IF NOT EXISTS "paymentId" TEXT`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "WalletTransactions" ADD COLUMN IF NOT EXISTS "balanceBefore" DECIMAL(18,2) NOT NULL DEFAULT 0`);
          await tenantPrisma.$executeRawUnsafe(`ALTER TABLE "WalletTransactions" ADD COLUMN IF NOT EXISTS "balanceAfter" DECIMAL(18,2) NOT NULL DEFAULT 0`);
          console.log(`  ✅ Patched missing columns`);
        } catch (e: any) {
          console.log(`  ~ Column patch: ${e.message.split('\n')[0]}`);
        }

        // Seed PaymentMethods in tenant schema
        try {
          const methods = [
            { code: 'CASH', name: 'Tiền mặt' },
            { code: 'BANK_TRANSFER', name: 'Chuyển khoản' },
          ];
          for (const m of methods) {
            await tenantPrisma.$executeRawUnsafe(`
              INSERT INTO "PaymentMethods" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
              VALUES (gen_random_uuid()::text, '${m.code}', '${m.name}', true, NOW(), NOW())
              ON CONFLICT ("code") DO NOTHING
            `);
          }
          console.log(`  ✅ Seeded PaymentMethods`);
        } catch (e: any) {
          console.log(`  ~ PaymentMethods seed: ${e.message.split('\n')[0]}`);
        }

        // Create VatInvoiceRequests table if not exists
        try {
          await tenantPrisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "VatInvoiceRequests" (
              "id" TEXT NOT NULL,
              "paymentId" TEXT NOT NULL,
              "restaurantId" TEXT NOT NULL,
              "companyName" TEXT NOT NULL,
              "taxId" TEXT NOT NULL,
              "address" TEXT NOT NULL,
              "email" TEXT NOT NULL,
              "status" TEXT NOT NULL DEFAULT 'PENDING',
              "misaRefId" TEXT,
              "misaLookupCode" TEXT,
              "errorMessage" TEXT,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "VatInvoiceRequests_pkey" PRIMARY KEY ("id")
            )
          `);
          await tenantPrisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "VatInvoiceRequests_paymentId_idx" 
            ON "VatInvoiceRequests"("paymentId")
          `);
          await tenantPrisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "VatInvoiceRequests_restaurantId_idx" 
            ON "VatInvoiceRequests"("restaurantId")
          `);
          console.log(`  ✅ VatInvoiceRequests table ready`);
        } catch (e: any) {
          console.log(`  ~ VatInvoiceRequests: ${e.message.split('\n')[0]}`);
        }

        // Check WalletTransactions
        const txExists = await tenantPrisma.$queryRaw<any[]>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = ${`tenant_${r.slug}`}
            AND table_name = 'WalletTransactions'
          ) as exists
        `;

        if (!txExists[0]?.exists) {
          await tenantPrisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "WalletTransactions" (
              "id" TEXT NOT NULL,
              "walletId" TEXT NOT NULL,
              "amount" DECIMAL(65,30) NOT NULL,
              "type" TEXT NOT NULL,
              "description" TEXT,
              "referenceId" TEXT,
              "referenceType" TEXT,
              "balanceBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
              "balanceAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
              "metadata" JSONB,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "WalletTransactions_pkey" PRIMARY KEY ("id")
            )
          `);
          await tenantPrisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "WalletTransactions_walletId_idx" 
            ON "WalletTransactions"("walletId")
          `);
          console.log(`  ✅ Created WalletTransactions`);
        } else {
          console.log(`  ✓ WalletTransactions already exists`);
        }
      });
    } catch (err: any) {
      console.error(`  ❌ Error for ${r.slug}:`, err.message);
    }
  }

  await centralPrisma.$disconnect();
  console.log('\nDone!');
}

main().catch(console.error);
