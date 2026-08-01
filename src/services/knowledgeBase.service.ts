import { prisma, centralPrisma, getSchemaName } from '../lib/prisma';
import { AIService } from './ai.service';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import path from 'path';

export class KnowledgeBaseService {
  /**
   * Processes an uploaded document: parses it, chunks it, generates embeddings, and saves to database.
   */
  /**
   * Creates a RestaurantDocument database entry and queues it for background RAG processing.
   */
  public static async processDocument(
    restaurantId: string,
    filename: string,
    fileType: 'PDF' | 'TXT' | 'DOCX' | 'URL' | 'MD',
    fileUrl: string,
    bucketId?: string,
    versionId?: string,
    isCentralDb: boolean = false
  ): Promise<any> {
    // Determine mounted status and chunking configuration of the bucket
    let isMounted = false;
    let chunkingStrategy = 'FIXED';
    let chunkSize = 800;
    let chunkOverlap = 100;

    if (restaurantId === 'system') {
      isCentralDb = true;
    }
    const db = isCentralDb ? centralPrisma : prisma;

    if (bucketId) {
      const bucket = await db.restaurantBucket.findUnique({
        where: { id: bucketId }
      });
      if (bucket) {
        isMounted = bucket.isMounted;
        chunkingStrategy = bucket.chunkingStrategy;
        chunkSize = bucket.chunkSize;
        chunkOverlap = bucket.chunkOverlap;
      }
    }

    // 1. Create a RestaurantDocument record
    const document = await db.restaurantDocument.create({
      data: {
        restaurantId,
        bucketId: bucketId || null,
        filename,
        fileUrl,
        fileType,
        versionId: versionId || null,
        status: isMounted ? 'PROCESSING' : 'STORED',
      },
    });

    // 2. Queue the document for background chunks & vector processing ONLY if mounted
    if (isMounted) {
      const { UploadQueueService } = await import('./uploadQueue.service');
      await UploadQueueService.addUploadJob({
        documentId: document.id,
        restaurantId,
        filename,
        fileUrl,
        fileType: fileType as 'PDF' | 'TXT' | 'MD',
        chunkingStrategy,
        chunkSize,
        chunkOverlap,
        isCentralDb,
      });
    }

    return document;
  }

  /**
   * Processes the document chunks, generates embeddings, and inserts them into pgvector.
   * This is executed in the background by the queue worker.
   */
  public static async processDocumentChunks(
    documentId: string,
    restaurantId: string,
    filename: string,
    fileBuffer: Buffer,
    fileType: 'PDF' | 'TXT' | 'DOCX' | 'URL' | 'MD',
    fileUrl: string,
    chunkingStrategy: string = 'FIXED',
    chunkSize: number = 800,
    chunkOverlap: number = 100,
    isCentralDb: boolean = false
  ): Promise<any> {
    if (restaurantId === 'system') {
      isCentralDb = true;
    }
    const db = isCentralDb ? centralPrisma : prisma;

    try {
      // 2. Extract text from file buffer
      let text = '';
      if (fileType === 'PDF') {
        try {
          const parser = new PDFParse({ data: fileBuffer });
          const parsed = await parser.getText();
          text = parsed.text || '';
        } catch (pdfErr) {
          console.warn('[KBService] PDFParse constructor failed, using fallback pdf-parse:', pdfErr);
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pdfParse = require('pdf-parse');
          const data = await pdfParse(fileBuffer);
          text = data.text || '';
        }
      } else if (fileType === 'DOCX') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        text = result.value || '';
      } else if (fileType === 'TXT' || fileType === 'MD') {
        text = fileBuffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      if (!text.trim()) {
        throw new Error('Extracted text is empty');
      }

      // 3. Chunk the text according to chunkingStrategy
      let chunks: string[] = [];
      if (chunkingStrategy === 'NONE') {
        chunks = [text];
      } else if (chunkingStrategy === 'SEMANTIC') {
        chunks = this.chunkTextSemantic(text, chunkSize);
      } else if (chunkingStrategy === 'ADAPTIVE') {
        chunks = await this.chunkTextAdaptive(text);
      } else {
        chunks = this.chunkTextFixed(text, chunkSize, chunkOverlap);
      }

      console.log(`[KBService] Created ${chunks.length} chunks for document: ${filename} using strategy ${chunkingStrategy}`);

      // 4. Generate embeddings and save chunks in pgvector database
      const schemaName = await getSchemaName(restaurantId);

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const embedding = await AIService.generateEmbedding(chunkText);
        
        const chunkId = randomUUID();
        const vectorStr = `[${embedding.join(',')}]`;
        const metadata = JSON.stringify({ index: i, filename });

        // Save to pgvector using parameterized raw SQL and explicit JSONB cast ($5::jsonb)
        await db.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."DocumentChunks" (id, "documentId", content, embedding, metadata, "createdAt") 
           VALUES ($1, $2, $3, $4::public.vector, $5::jsonb, NOW())`,
          chunkId,
          documentId,
          chunkText,
          vectorStr,
          metadata
        );
      }

      // 5. Update document status to INDEXED
      const updatedDoc = await db.restaurantDocument.update({
        where: { id: documentId },
        data: { status: 'INDEXED' },
      });

      return updatedDoc;
    } catch (err: any) {
      console.error(`[KBService] Failed to process document chunks for ${filename}:`, err);
      // Update document status to FAILED and save error log
      await db.restaurantDocument.update({
        where: { id: documentId },
        data: { 
          status: 'FAILED',
          errorLog: err.stack || err.message || String(err)
        },
      }).catch((e) => console.error(`[KBService] Failed to update error log for failed document:`, e));
      throw err;
    }
  }

  private static async chunkTextAdaptive(text: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.resolve(process.cwd(), 'scripts/adaptive_chunk.py');
      
      const pythonCommand = process.env.PYTHON_PATH || 'python';
      const child = spawn(pythonCommand, [scriptPath]);
      
      let stdoutData = '';
      let stderrData = '';
      
      child.stdout.on('data', (data: any) => {
        stdoutData += data.toString();
      });
      
      child.stderr.on('data', (data: any) => {
        stderrData += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code !== 0) {
          console.error(`[KBService] adaptive_chunk.py failed with code ${code}. Stderr: ${stderrData}`);
          reject(new Error(`Adaptive chunking script failed: ${stderrData}`));
          return;
        }
        
        try {
          const chunks = JSON.parse(stdoutData.trim());
          if (Array.isArray(chunks)) {
            resolve(chunks);
          } else {
            reject(new Error('Adaptive chunking script did not return a JSON array'));
          }
        } catch (e: any) {
          console.error(`[KBService] Failed to parse JSON from adaptive_chunk.py. Output: ${stdoutData}`, e);
          reject(new Error(`Failed to parse chunks JSON: ${e.message}`));
        }
      });
      
      child.stdin.write(text);
      child.stdin.end();
    });
  }

  public static async createSnapshot(
    restaurantId: string,
    bucketId: string | null,
    versionName: string,
    description?: string
  ): Promise<any> {
    const docs = await prisma.restaurantDocument.findMany({
      where: { restaurantId, bucketId: bucketId || null, status: 'INDEXED' },
      select: { filename: true, fileUrl: true, fileType: true, versionId: true }
    });

    const snapshot = await prisma.restaurantKBSnapshot.create({
      data: {
        restaurantId,
        bucketId: bucketId || null,
        versionName,
        description: description || null,
        documents: docs as any
      }
    });

    return snapshot;
  }

  public static async rollbackToSnapshot(
    restaurantId: string,
    bucketId: string | null,
    snapshotId: string
  ): Promise<any> {
    const snapshot = await prisma.restaurantKBSnapshot.findUnique({
      where: { id: snapshotId }
    });

    if (!snapshot || snapshot.restaurantId !== restaurantId) {
      throw new Error('Không tìm thấy bản lịch sử hoặc không có quyền.');
    }

    const targetDocs = (snapshot.documents as any) || [];
    const targetUrls = Array.from(new Set<string>(targetDocs.map((d: any) => d.fileUrl as string)));

    // 1. Delete all current documents not in the target snapshot
    const docsToDelete = await prisma.restaurantDocument.findMany({
      where: {
        restaurantId,
        bucketId: bucketId || null,
        NOT: { fileUrl: { in: targetUrls } }
      }
    });

    for (const doc of docsToDelete) {
      await prisma.restaurantDocument.delete({ where: { id: doc.id } });
    }

    // 2. Restore documents in the snapshot
    const { UploadQueueService } = await import('./uploadQueue.service');
    const bucket = bucketId ? await prisma.restaurantBucket.findUnique({ where: { id: bucketId } }) : null;
    const strategy = bucket?.chunkingStrategy || 'FIXED';
    const size = bucket?.chunkSize || 800;
    const overlap = bucket?.chunkOverlap || 100;

    const restoredDocs = [];

    for (const tDoc of targetDocs) {
      // Check if it already exists
      const existing = await prisma.restaurantDocument.findFirst({
        where: {
          restaurantId,
          bucketId: bucketId || null,
          fileUrl: tDoc.fileUrl
        }
      });

      if (existing) {
        if (existing.status === 'INDEXED') {
          restoredDocs.push(existing);
          continue; // Already successfully indexed
        }
        // If not indexed, re-trigger
        await prisma.documentChunk.deleteMany({ where: { documentId: existing.id } });
        await prisma.restaurantDocument.update({
          where: { id: existing.id },
          data: { status: 'PROCESSING' }
        });
        await UploadQueueService.addUploadJob({
          documentId: existing.id,
          restaurantId,
          filename: existing.filename,
          fileUrl: existing.fileUrl,
          fileType: existing.fileType as 'PDF' | 'TXT' | 'MD',
          chunkingStrategy: strategy,
          chunkSize: size,
          chunkOverlap: overlap
        });
        restoredDocs.push(existing);
      } else {
        // Recreate and process
        const document = await prisma.restaurantDocument.create({
          data: {
            restaurantId,
            bucketId: bucketId || null,
            filename: tDoc.filename,
            fileUrl: tDoc.fileUrl,
            fileType: tDoc.fileType,
            versionId: tDoc.versionId || null,
            status: 'PROCESSING'
          }
        });

        await UploadQueueService.addUploadJob({
          documentId: document.id,
          restaurantId,
          filename: document.filename,
          fileUrl: document.fileUrl,
          fileType: document.fileType as 'PDF' | 'TXT' | 'MD',
          chunkingStrategy: strategy,
          chunkSize: size,
          chunkOverlap: overlap
        });
        restoredDocs.push(document);
      }
    }

    return { success: true, count: restoredDocs.length };
  }

  private static chunkTextFixed(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let offset = 0;
    while (offset < text.length) {
      let end = offset + chunkSize;
      if (end < text.length) {
        // Try to break at a space boundary to not split words
        const spaceIndex = text.lastIndexOf(' ', end);
        if (spaceIndex > offset + chunkSize - 50) {
          end = spaceIndex;
        }
      }
      chunks.push(text.substring(offset, end).trim());
      offset = end - overlap;
      if (offset >= text.length || chunkSize <= overlap) break;
    }
    return chunks.filter(Boolean);
  }

  private static chunkTextSemantic(text: string, chunkSize: number): string[] {
    // Semantic strategy leverages paragraph and headers logic
    return this.chunkText(text, chunkSize, Math.floor(chunkSize * 0.1));
  }

  private static chunkText(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
    const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    
    let currentChunk = '';
    let currentHeader = '';
    
    for (const paragraph of paragraphs) {
      // Look for a markdown header in this paragraph to keep header context
      const lines = paragraph.split('\n');
      const headerLine = lines.find(line => line.trim().startsWith('#'));
      if (headerLine) {
        currentHeader = headerLine.trim();
      }

      // Prepare context-prefix if applicable
      const contextPrefix = currentHeader && !paragraph.includes(currentHeader) ? currentHeader + '\n\n' : '';
      const estimatedLength = contextPrefix.length + (currentChunk ? currentChunk.length + 2 : 0) + paragraph.length;

      if (estimatedLength <= chunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      } else {
        if (currentChunk) {
          // Push current chunk with header context prepended
          const finalChunk = currentHeader && !currentChunk.includes(currentHeader) 
            ? `${currentHeader}\n\n${currentChunk}` 
            : currentChunk;
          chunks.push(finalChunk);
        }
        
        // Handle case where single paragraph exceeds chunk size
        if (paragraph.length > chunkSize) {
          let offset = 0;
          while (offset < paragraph.length) {
            const part = paragraph.substring(offset, offset + chunkSize);
            const finalPart = currentHeader && !part.includes(currentHeader)
              ? `${currentHeader}\n\n${part}`
              : part;
            chunks.push(finalPart);
            offset += (chunkSize - overlap);
          }
          currentChunk = '';
        } else {
          // Overlap: seed the next chunk with the last portion of the current chunk
          const lastWords = currentChunk.split(/\s+/).slice(-15).join(' ');
          currentChunk = lastWords ? lastWords + '\n\n' + paragraph : paragraph;
        }
      }
    }
    
    if (currentChunk) {
      const finalChunk = currentHeader && !currentChunk.includes(currentHeader) 
        ? `${currentHeader}\n\n${currentChunk}` 
        : currentChunk;
      chunks.push(finalChunk);
    }
    
    return chunks;
  }
}
