import { centralPrisma, getTenantPrisma, getTenantConnectionUrl } from '../lib/prisma';
import { ENV } from '../config/env';

async function copyDocs() {
  const restaurantId = '1bc7d0bb-f15b-408d-844b-018f832e16e3';
  const slug = 'gao-beer';

  console.log(`[Sync] Syncing documents from public schema to tenant_${slug}...`);

  const tenantDbUrl = getTenantConnectionUrl(ENV.DATABASE_URL, slug);
  const tenantPrisma = getTenantPrisma(tenantDbUrl);

  // 1. Get documents from public schema
  const publicDocs = await centralPrisma.restaurantDocument.findMany({
    where: { restaurantId }
  });

  console.log(`[Sync] Found ${publicDocs.length} documents in public schema.`);

  for (const doc of publicDocs) {
    // 2. Check if doc exists in tenant schema
    const tenantDoc = await tenantPrisma.restaurantDocument.findUnique({
      where: { id: doc.id }
    });

    if (!tenantDoc) {
      console.log(`[Sync] Creating document "${doc.filename}" in tenant schema...`);
      await tenantPrisma.restaurantDocument.create({
        data: {
          id: doc.id,
          restaurantId: doc.restaurantId,
          bucketId: doc.bucketId,
          filename: doc.filename,
          fileUrl: doc.fileUrl,
          fileType: doc.fileType,
          versionId: doc.versionId,
          status: doc.status,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }
      });
    } else {
      console.log(`[Sync] Document "${doc.filename}" already exists in tenant schema. Updating status to matches public...`);
      await tenantPrisma.restaurantDocument.update({
        where: { id: doc.id },
        data: { status: doc.status }
      });
    }

    // 3. Fetch chunks from public schema
    const publicChunks = await centralPrisma.$queryRawUnsafe<any[]>(
      `SELECT id, "documentId", content, embedding::text, metadata FROM "DocumentChunks" WHERE "documentId" = $1`,
      doc.id
    );

    console.log(`[Sync] Found ${publicChunks.length} chunks for "${doc.filename}".`);

    for (const chunk of publicChunks) {
      // Check if chunk exists in tenant
      const existingChunks = await tenantPrisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "DocumentChunks" WHERE id = $1`,
        chunk.id
      );

      if (existingChunks.length === 0) {
        // Parse metadata to JSON string safely
        const metaStr = typeof chunk.metadata === 'string' ? chunk.metadata : JSON.stringify(chunk.metadata || {});
        // Parse embedding text back to vector string format [val, val, ...]
        const vectorStr = chunk.embedding; // Already formatted as [x,y,z...] from query
        
        await tenantPrisma.$executeRawUnsafe(
          `INSERT INTO "DocumentChunks" (id, "documentId", content, embedding, metadata, "createdAt")
           VALUES ($1, $2, $3, $4::public.vector, $5::jsonb, NOW())`,
          chunk.id,
          chunk.documentId,
          chunk.content,
          vectorStr,
          metaStr
        );
      }
    }
  }

  console.log('[Sync] Completed syncing documents to tenant schema!');
  process.exit(0);
}

copyDocs().catch(err => {
  console.error('[Sync] Error during sync:', err);
  process.exit(1);
});
