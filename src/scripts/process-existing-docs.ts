import { getTenantPrisma, getTenantConnectionUrl, prismaStorage } from '../lib/prisma';
import { ENV } from '../config/env';
import { UploadQueueService } from '../services/uploadQueue.service';
import { KnowledgeBaseService } from '../services/knowledgeBase.service';

async function processDocs() {
  const restaurantId = '1bc7d0bb-f15b-408d-844b-018f832e16e3';
  const slug = 'gao-beer';

  console.log(`[Process] Starting document ingestion for tenant: ${slug}...`);

  const tenantDbUrl = getTenantConnectionUrl(ENV.DATABASE_URL, slug);
  const tenantPrisma = getTenantPrisma(tenantDbUrl);

  // Run inside tenant prisma context
  await prismaStorage.run(tenantPrisma, async () => {
    // 1. Ensure default bucket exists
    let defaultBucket = await tenantPrisma.restaurantBucket.findFirst({
      where: { restaurantId, name: "Default Bucket" }
    });
    if (!defaultBucket) {
      defaultBucket = await tenantPrisma.restaurantBucket.create({
        data: {
          restaurantId,
          name: "Default Bucket",
          url: "default",
          description: "Cơ sở lưu trữ tri thức mặc định của nhà hàng",
          isChatEnabled: true,
          isMounted: true,
          chunkingStrategy: "FIXED",
          chunkSize: 800,
          chunkOverlap: 100
        }
      });
      console.log(`[Process] Created default bucket: ${defaultBucket.id}`);
    } else {
      console.log(`[Process] Found existing default bucket: ${defaultBucket.id}`);
      // Ensure it is mounted
      await tenantPrisma.restaurantBucket.update({
        where: { id: defaultBucket.id },
        data: { isMounted: true }
      });
    }

    // 2. Find all documents in tenant schema
    const docs = await tenantPrisma.restaurantDocument.findMany({
      where: { restaurantId }
    });

    console.log(`[Process] Found ${docs.length} documents in tenant schema.`);

    for (const doc of docs) {
      console.log(`[Process] Indexing document: "${doc.filename}" (${doc.id})...`);
      
      // Update bucketId and set status to PROCESSING
      await tenantPrisma.restaurantDocument.update({
        where: { id: doc.id },
        data: { 
          bucketId: defaultBucket.id,
          status: 'PROCESSING'
        }
      });

      try {
        // Get file buffer
        const buffer = await UploadQueueService.getFileBuffer(doc.fileUrl);
        
        // Process chunks and vectors (which saves and updates status to INDEXED)
        await KnowledgeBaseService.processDocumentChunks(
          doc.id,
          restaurantId,
          doc.filename,
          buffer,
          doc.fileType as any,
          doc.fileUrl,
          defaultBucket.chunkingStrategy,
          defaultBucket.chunkSize,
          defaultBucket.chunkOverlap
        );
        
        console.log(`[Process] Successfully indexed: "${doc.filename}"`);
      } catch (err) {
        console.error(`[Process] Failed to process document "${doc.filename}":`, err);
      }
    }
  });

  console.log('[Process] Finished processing all documents!');
  process.exit(0);
}

processDocs().catch(e => {
  console.error('[Process] Uncaught error:', e);
  process.exit(1);
});
