import { prisma } from '../lib/prisma';
import { AIService } from './ai.service';
import { PDFParse } from 'pdf-parse';
import { randomUUID } from 'crypto';

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
    bucketId?: string
  ): Promise<any> {
    // Determine mounted status and chunking configuration of the bucket
    let isMounted = false;
    let chunkingStrategy = 'FIXED';
    let chunkSize = 800;
    let chunkOverlap = 100;

    if (bucketId) {
      const bucket = await prisma.restaurantBucket.findUnique({
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
    const document = await prisma.restaurantDocument.create({
      data: {
        restaurantId,
        bucketId: bucketId || null,
        filename,
        fileUrl,
        fileType,
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
    chunkOverlap: number = 100
  ): Promise<any> {
    try {
      // 2. Extract text from file buffer
      let text = '';
      if (fileType === 'PDF') {
        const parser = new PDFParse({ data: fileBuffer });
        const parsed = await parser.getText();
        text = parsed.text;
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
      } else {
        chunks = this.chunkTextFixed(text, chunkSize, chunkOverlap);
      }

      console.log(`[KBService] Created ${chunks.length} chunks for document: ${filename} using strategy ${chunkingStrategy}`);

      // 4. Generate embeddings and save chunks in pgvector database
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const embedding = await AIService.generateEmbedding(chunkText);
        
        const chunkId = randomUUID();
        const vectorStr = `[${embedding.join(',')}]`;
        const metadata = JSON.stringify({ index: i, filename });

        // Save to pgvector using parameterized raw SQL and explicit JSONB cast ($5::jsonb)
        await prisma.$executeRawUnsafe(
          `INSERT INTO "DocumentChunks" (id, "documentId", content, embedding, metadata, "createdAt") 
           VALUES ($1, $2, $3, $4::vector, $5::jsonb, NOW())`,
          chunkId,
          documentId,
          chunkText,
          vectorStr,
          metadata
        );
      }

      // 5. Update document status to INDEXED
      const updatedDoc = await prisma.restaurantDocument.update({
        where: { id: documentId },
        data: { status: 'INDEXED' },
      });

      return updatedDoc;
    } catch (err: any) {
      console.error(`[KBService] Failed to process document chunks for ${filename}:`, err);
      // Update document status to FAILED
      await prisma.restaurantDocument.update({
        where: { id: documentId },
        data: { status: 'FAILED' },
      }).catch(() => {});
      throw err;
    }
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
