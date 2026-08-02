/**
 * Provision (idempotent) các bảng RAG cho MỌI tenant schema.
 * Một số tenant cũ được tạo schema mà thiếu RestaurantBuckets / RestaurantDocuments /
 * DocumentChunks / RestaurantKBSnapshots → RAG query lỗi 42P01 (relation does not exist).
 *
 * Chạy:
 *   npx ts-node -r tsconfig-paths/register src/scripts/provision-tenant-rag-tables.ts
 */
import { centralPrisma } from '../lib/prisma';

async function ensureRagTables(schema: string): Promise<void> {
  await centralPrisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  await centralPrisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."RestaurantBuckets" (
      "id" TEXT PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "description" TEXT,
      "isChatEnabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "isMounted" BOOLEAN NOT NULL DEFAULT false,
      "chunkingStrategy" TEXT NOT NULL DEFAULT 'FIXED',
      "chunkSize" INTEGER NOT NULL DEFAULT 800,
      "chunkOverlap" INTEGER NOT NULL DEFAULT 100,
      CONSTRAINT "RestaurantBuckets_restaurantId_name_key" UNIQUE ("restaurantId", "name")
    )`
  );

  await centralPrisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."RestaurantDocuments" (
      "id" TEXT PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "bucketId" TEXT,
      "filename" TEXT NOT NULL,
      "fileUrl" TEXT NOT NULL,
      "fileType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "versionId" TEXT,
      "errorLog" TEXT
    )`
  );
  await centralPrisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RestaurantDocuments_restaurantId_idx" ON "${schema}"."RestaurantDocuments" ("restaurantId")`);
  await centralPrisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RestaurantDocuments_bucketId_idx" ON "${schema}"."RestaurantDocuments" ("bucketId")`);

  await centralPrisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."DocumentChunks" (
      "id" TEXT PRIMARY KEY,
      "documentId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "embedding" public.vector,
      "metadata" JSONB,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );
  await centralPrisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DocumentChunks_documentId_idx" ON "${schema}"."DocumentChunks" ("documentId")`);

  await centralPrisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."RestaurantKBSnapshots" (
      "id" TEXT PRIMARY KEY,
      "restaurantId" TEXT NOT NULL,
      "bucketId" TEXT,
      "versionName" TEXT NOT NULL,
      "description" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "documents" JSONB NOT NULL DEFAULT '[]'::jsonb
    )`
  );
  await centralPrisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RestaurantKBSnapshots_restaurantId_idx" ON "${schema}"."RestaurantKBSnapshots" ("restaurantId")`);
}

async function main() {
  const rows = await centralPrisma.$queryRawUnsafe<Array<{ schema_name: string }>>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name`
  );
  console.log(`[Provision] Tìm thấy ${rows.length} tenant schema.`);
  for (const { schema_name } of rows) {
    try {
      await ensureRagTables(schema_name);
      console.log(`  ✅ ${schema_name}`);
    } catch (e: any) {
      console.error(`  ❌ ${schema_name}: ${e?.message}`);
    }
  }
  await centralPrisma.$disconnect();
  console.log('[Provision] Hoàn tất.');
}

main().catch((e) => {
  console.error('[Provision] Lỗi:', e);
  process.exit(1);
});
