import { Queue, Worker } from 'bullmq';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { KnowledgeBaseService } from './knowledgeBase.service';
import redisClient from '../lib/redis';

export class UploadQueueService {
  private static queue: Queue | null = null;
  private static worker: Worker | null = null;
  private static isBullMQActive = false;

  private static inMemoryTasks: Array<{
    documentId: string;
    restaurantId: string;
    filename: string;
    fileUrl: string;
    fileType: 'PDF' | 'TXT' | 'MD';
    chunkingStrategy?: string;
    chunkSize?: number;
    chunkOverlap?: number;
  }> = [];
  private static isProcessingInMemory = false;

  /**
   * Initializes the queue manager. Attempts to connect to Redis for BullMQ;
   * falls back to in-memory processing if Redis is unavailable or fails.
   */
  public static initialize() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.log('[UploadQueue] REDIS_URL not configured. Using in-memory fallback queue.');
      this.startInMemoryWorker();
      return;
    }

    // Check Redis eviction policy
    this.checkEvictionPolicy();

    try {
      console.log('[UploadQueue] Connecting to Redis for BullMQ...');
      
      this.queue = new Queue('document-uploads', {
        connection: {
          url: redisUrl,
          connectTimeout: 5000,
          maxRetriesPerRequest: null,
        }
      });

      this.worker = new Worker('document-uploads', async (job) => {
        const { documentId, restaurantId, filename, fileUrl, fileType, chunkingStrategy, chunkSize, chunkOverlap } = job.data;
        await this.processJob(documentId, restaurantId, filename, fileUrl, fileType, chunkingStrategy, chunkSize, chunkOverlap);
      }, {
        connection: {
          url: redisUrl,
          connectTimeout: 5000,
          maxRetriesPerRequest: null,
        }
      });

      this.worker.on('completed', (job) => {
        console.log(`[UploadQueue] Job ${job.id} completed successfully`);
      });

      this.worker.on('failed', (job, err) => {
        console.error(`[UploadQueue] Job ${job?.id} failed:`, err);
      });

      this.isBullMQActive = true;
      console.log('[UploadQueue] BullMQ successfully initialized.');
    } catch (err) {
      console.warn('[UploadQueue] Failed to initialize BullMQ. Falling back to in-memory queue. Error:', err);
      this.isBullMQActive = false;
      this.startInMemoryWorker();
    }
  }

  /**
   * Pushes a new document processing job to the queue.
   */
  public static async addUploadJob(data: {
    documentId: string;
    restaurantId: string;
    filename: string;
    fileUrl: string;
    fileType: 'PDF' | 'TXT' | 'MD';
    chunkingStrategy?: string;
    chunkSize?: number;
    chunkOverlap?: number;
  }) {
    if (this.isBullMQActive && this.queue) {
      try {
        await this.queue.add(`upload-${data.documentId}`, data, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          }
        });
        console.log(`[UploadQueue] Queued job in BullMQ for document: ${data.filename}`);
        return;
      } catch (err) {
        console.warn('[UploadQueue] BullMQ push failed, falling back to in-memory. Error:', err);
      }
    }

    // Push to in-memory queue
    this.inMemoryTasks.push(data);
    console.log(`[UploadQueue] Queued in-memory job for document: ${data.filename}`);
    this.triggerInMemoryProcessing();
  }

  private static startInMemoryWorker() {
    // Periodically poll for pending documents in the database that might have been missed
    setInterval(() => {
      this.pollPendingDocumentsFromDb();
    }, 30000);
  }

  private static async pollPendingDocumentsFromDb() {
    try {
      const pendingDocs = await prisma.restaurantDocument.findMany({
        where: { status: 'PROCESSING' },
        take: 5,
      });

      for (const doc of pendingDocs) {
        const isInQueue = this.inMemoryTasks.some(t => t.documentId === doc.id);
        if (!isInQueue) {
          let chunkingStrategy = 'FIXED';
          let chunkSize = 800;
          let chunkOverlap = 100;
          
          if (doc.bucketId) {
            const bucket = await prisma.restaurantBucket.findUnique({
              where: { id: doc.bucketId }
            });
            if (bucket) {
              chunkingStrategy = bucket.chunkingStrategy;
              chunkSize = bucket.chunkSize;
              chunkOverlap = bucket.chunkOverlap;
            }
          }

          await this.addUploadJob({
            documentId: doc.id,
            restaurantId: doc.restaurantId,
            filename: doc.filename,
            fileUrl: doc.fileUrl,
            fileType: doc.fileType as 'PDF' | 'TXT' | 'MD',
            chunkingStrategy,
            chunkSize,
            chunkOverlap,
          });
        }
      }
    } catch (err) {
      console.error('[UploadQueue] Failed to poll pending documents:', err);
    }
  }

  private static async triggerInMemoryProcessing() {
    if (this.isProcessingInMemory) return;
    this.isProcessingInMemory = true;

    while (this.inMemoryTasks.length > 0) {
      const task = this.inMemoryTasks.shift();
      if (task) {
        try {
          console.log(`[UploadQueue] Processing in-memory task: ${task.filename}`);
          await this.processJob(
            task.documentId,
            task.restaurantId,
            task.filename,
            task.fileUrl,
            task.fileType,
            task.chunkingStrategy,
            task.chunkSize,
            task.chunkOverlap
          );
        } catch (err) {
          console.error(`[UploadQueue] Failed to process in-memory task for ${task.filename}:`, err);
        }
      }
    }

    this.isProcessingInMemory = false;
  }

  private static async processJob(
    documentId: string,
    restaurantId: string,
    filename: string,
    fileUrl: string,
    fileType: 'PDF' | 'TXT' | 'MD',
    chunkingStrategy?: string,
    chunkSize?: number,
    chunkOverlap?: number
  ) {
    // 1. Fetch file content from URL
    console.log(`[UploadQueue] Fetching file buffer from: ${fileUrl}`);
    const buffer = await this.getFileBuffer(fileUrl);

    // 2. Call the KnowledgeBase chunks processing logic
    await KnowledgeBaseService.processDocumentChunks(
      documentId,
      restaurantId,
      filename,
      buffer,
      fileType,
      fileUrl,
      chunkingStrategy,
      chunkSize,
      chunkOverlap
    );
  }

  public static async getFileBuffer(fileUrl: string): Promise<Buffer> {
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } else if (fileUrl.startsWith('file://local-storage/')) {
      const cleanFilename = fileUrl.replace('file://local-storage/', '');
      const localPath = path.resolve(process.cwd(), 'uploads/kb', cleanFilename);
      return fs.readFileSync(localPath);
    } else {
      try {
        const cleanFilename = fileUrl.split('/').pop() || '';
        const localPath = path.resolve(process.cwd(), 'uploads/kb', cleanFilename);
        if (fs.existsSync(localPath)) {
          return fs.readFileSync(localPath);
        }
      } catch (err) {
        // eslint-disable-next-line no-empty
      }
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }
  }

  private static async checkEvictionPolicy() {
    try {
      if (!redisClient.isOpen) {
        await new Promise<void>((resolve) => {
          redisClient.once('connect', () => resolve());
          setTimeout(() => resolve(), 3000); // safety timeout
        });
      }

      if (redisClient.isOpen) {
        let policy: string | undefined;
        try {
          const config = await redisClient.configGet('maxmemory-policy');
          policy = config ? config['maxmemory-policy'] : undefined;
        } catch (err) {
          // configGet might be unsupported/blocked on managed Redis (like Redis Cloud)
        }

        // Fallback to INFO memory if CONFIG GET returned undefined or failed
        if (!policy) {
          try {
            const info = await redisClient.info('memory');
            const match = info.match(/maxmemory_policy:(.+)/);
            if (match) {
              policy = match[1].trim();
            }
          } catch (err) {
            // ignore info command errors
          }
        }

        console.log(`[UploadQueue] Redis maxmemory-policy is currently: "${policy || 'unknown'}"`);
        if (policy && policy !== 'noeviction') {
          console.warn('\n================================================================');
          console.warn(`⚠️  WARNING: Redis maxmemory-policy is set to "${policy}"!`);
          console.warn('⚠️  For BullMQ to function correctly under memory pressure,');
          console.warn('⚠️  please set the Redis eviction policy to "noeviction".');
          console.warn('⚠️  Otherwise, active queues or job data might be silently evicted.');
          console.warn('================================================================\n');
        }
      }
    } catch (err) {
      console.warn('[UploadQueue] Could not verify Redis maxmemory-policy configuration:', err);
    }
  }
}
