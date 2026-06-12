import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING PERFORMANCE INDEX CREATION ---');
  try {
    // 1. Create HNSW Vector Index for Fast Cosine Similarity
    console.log('1. Creating HNSW vector index on "DocumentChunks"(embedding)...');
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS doc_chunks_hnsw_idx ON "DocumentChunks" USING hnsw (embedding vector_cosine_ops);`
    );
    console.log('✓ HNSW vector index created successfully or already exists.');

    // 2. Create GIN index for Fast Full-Text Search
    console.log('2. Creating GIN full-text index on "DocumentChunks"(content)...');
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS doc_chunks_fts_idx ON "DocumentChunks" USING gin (to_tsvector('simple', content));`
    );
    console.log('✓ GIN full-text index created successfully or already exists.');

    console.log('--- ALL INDEXES CREATED SUCCESSFULLY ---');
  } catch (err) {
    console.error('✗ Error creating performance indexes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
