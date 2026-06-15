import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import { KnowledgeBaseService } from '../../services/knowledgeBase.service';
import { RAGService } from '../../services/rag.service';
import { StorageService } from '../../services/storage.service';
import { ENV } from '../../config/env';
import { AIService } from '../../services/ai.service';

const router: ExpressRouter = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Limit 10MB

/**
 * 1. POST /api/ai/kb/upload
 * Quét tài liệu nhà hàng và xử lý Ingestion (Chunking + Vector pgvector)
 */
router.post('/kb/upload', authMiddleware, tenantGuard, upload.any(), async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const bucketId = req.body.bucketId || req.query.bucketId || undefined;

    // Admin bypass: if system admin, they can pass target restaurantId in body or query
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && (req.body.restaurantId || req.query.restaurantId)) {
      restaurantId = req.body.restaurantId || req.query.restaurantId;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Tài khoản không thuộc về nhà hàng nào hoặc thiếu restaurantId.' });
    }

    // Capture single file or multiple files
    const files: any[] = [];
    if (req.file) {
      files.push(req.file);
    }
    if (req.files && Array.isArray(req.files)) {
      files.push(...req.files);
    }

    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một tệp tin để tải lên.' });
    }

    const pathsInput = req.body.paths || req.query.paths;
    const paths = Array.isArray(pathsInput)
      ? pathsInput
      : pathsInput
        ? [pathsInput]
        : [];

    const processedDocuments = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const originalName = paths[i] || file.originalname;

      // Determine type based on extension
      const ext = originalName.split('.').pop()?.toUpperCase();
      let fileType: 'PDF' | 'TXT' | 'MD' = 'TXT';
      if (ext === 'PDF') {
        fileType = 'PDF';
      } else if (ext === 'MD') {
        fileType = 'MD';
      } else if (ext === 'TXT') {
        fileType = 'TXT';
      } else {
        console.warn(`[KB API] Skipping unsupported file type: ${originalName}`);
        continue;
      }

      console.log(`[KB API] Uploading file ${originalName} for restaurant ${restaurantId} to storage...`);
      const fileUrl = await StorageService.uploadFile(originalName, file.buffer, fileType);

      console.log(`[KB API] Registering file ${originalName} in database and queuing...`);
      const document = await KnowledgeBaseService.processDocument(
        restaurantId,
        originalName,
        fileType,
        fileUrl,
        bucketId
      );

      processedDocuments.push(document);
    }

    if (processedDocuments.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có tệp tin hợp lệ nào được tải lên.' });
    }

    return res.json({
      success: true,
      data: processedDocuments.length === 1 ? processedDocuments[0] : processedDocuments,
      message: `Đang xử lý ${processedDocuments.length} tài liệu trong nền! Trạng thái sẽ tự động cập nhật khi hoàn tất.`,
    });
  } catch (err: any) {
    console.error('[KB API] Upload error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi tải lên tài liệu.' });
  }
});

/**
 * 2. GET /api/ai/kb/documents
 * Lấy danh sách tài liệu Cơ sở Tri thức đã tải lên của nhà hàng
 */
router.get('/kb/documents', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const { bucketId } = req.query;

    // Admin bypass: if system admin, they can pass target restaurantId in query
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && req.query.restaurantId) {
      restaurantId = req.query.restaurantId as string;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    const whereClause: any = { restaurantId };
    if (bucketId) {
      if (bucketId === 'unassigned') {
        whereClause.bucketId = null;
      } else {
        whereClause.bucketId = bucketId as string;
      }
    }

    const documents = await prisma.restaurantDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        fileUrl: true,
        fileType: true,
        status: true,
        createdAt: true,
        bucketId: true,
      },
    });

    return res.json({ success: true, data: documents });
  } catch (err) {
    console.error('[KB API] List error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * 3. DELETE /api/ai/kb/documents
 * Xóa toàn bộ tài liệu hoặc xóa theo thư mục (prefix)
 */
router.delete('/kb/documents', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const { prefix, ids } = req.query;

    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    
    if (isSystemAdmin && req.query.restaurantId) {
      restaurantId = req.query.restaurantId as string;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    if (ids && typeof ids === 'string') {
      const idList = ids.split(',').filter(Boolean);
      await prisma.restaurantDocument.deleteMany({
        where: {
          restaurantId,
          id: { in: idList }
        }
      });
      return res.json({ success: true, message: `Đã xóa ${idList.length} tài liệu được chọn.` });
    }

    if (prefix) {
      await prisma.restaurantDocument.deleteMany({
        where: {
          restaurantId,
          OR: [
            { filename: prefix as string },
            { filename: { startsWith: `${prefix}/` } }
          ]
        }
      });
      return res.json({ success: true, message: `Đã xóa thư mục/tài liệu: ${prefix}` });
    } else {
      await prisma.restaurantDocument.deleteMany({
        where: { restaurantId }
      });
      return res.json({ success: true, message: 'Đã xóa toàn bộ tài liệu và làm trống Cơ sở Tri thức.' });
    }
  } catch (err: any) {
    console.error('[KB API] Delete path error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi xóa tài liệu.' });
  }
});

/**
 * 3.05. DELETE /api/ai/kb/documents/duplicates
 * Xóa các tài liệu trùng lặp (giữ lại phiên bản mới nhất)
 */
router.delete('/kb/documents/duplicates', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const { bucketId } = req.query;

    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    
    if (isSystemAdmin && req.query.restaurantId) {
      restaurantId = req.query.restaurantId as string;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    const whereClause: any = { restaurantId };
    if (bucketId) {
      if (bucketId === 'unassigned') {
        whereClause.bucketId = null;
      } else if (bucketId !== 'all') {
        whereClause.bucketId = bucketId as string;
      }
    }

    // Lấy tất cả tài liệu sắp xếp theo ngày tạo giảm dần
    const docs = await prisma.restaurantDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        bucketId: true,
        createdAt: true
      }
    });

    // Nhóm tài liệu theo filename + bucketId để phân biệt namespaces
    const groups: { [key: string]: typeof docs } = {};
    for (const doc of docs) {
      const key = `${doc.bucketId || 'null'}::${doc.filename}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(doc);
    }

    const idsToDelete: string[] = [];
    const deletedFilenames: string[] = [];

    for (const key in groups) {
      const groupDocs = groups[key];
      if (groupDocs.length > 1) {
        // Giữ lại groupDocs[0] (mới nhất), xóa các phần tử còn lại
        for (let i = 1; i < groupDocs.length; i++) {
          idsToDelete.push(groupDocs[i].id);
          if (!deletedFilenames.includes(groupDocs[i].filename)) {
            deletedFilenames.push(groupDocs[i].filename);
          }
        }
      }
    }

    if (idsToDelete.length > 0) {
      await prisma.restaurantDocument.deleteMany({
        where: {
          restaurantId,
          id: { in: idsToDelete }
        }
      });
      return res.json({
        success: true,
        message: `Đã dọn dẹp và xóa ${idsToDelete.length} tài liệu bị trùng lặp.`,
        data: {
          deletedCount: idsToDelete.length,
          deletedFilenames
        }
      });
    }

    return res.json({
      success: true,
      message: 'Không tìm thấy tài liệu trùng lặp nào.',
      data: {
        deletedCount: 0,
        deletedFilenames: []
      }
    });
  } catch (err: any) {
    console.error('[KB API] Delete duplicates error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi xóa tài liệu trùng.' });
  }
});

/**
 * 3.1. DELETE /api/ai/kb/documents/:id
 * Xóa tài liệu khỏi Cơ sở Tri thức (tự động xóa các chunk nhờ onDelete: Cascade)
 */
router.delete('/kb/documents/:id', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    const { id } = req.params;

    // Admin bypass: system admins can delete any document
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');

    let doc;
    if (isSystemAdmin) {
      doc = await prisma.restaurantDocument.findUnique({
        where: { id },
      });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      doc = await prisma.restaurantDocument.findFirst({
        where: { id, restaurantId },
      });
    }

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu hoặc không có quyền xóa.' });
    }

    await prisma.restaurantDocument.delete({ where: { id } });

    return res.json({ success: true, message: 'Tài liệu đã được xóa khỏi Cơ sở Tri thức.' });
  } catch (err) {
    console.error('[KB API] Delete error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * 3.2. GET /api/ai/kb/buckets
 * Lấy danh sách buckets của nhà hàng hoặc hệ thống
 */
router.get('/kb/buckets', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && req.query.restaurantId) {
      restaurantId = req.query.restaurantId as string;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    const buckets = await prisma.restaurantBucket.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: buckets });
  } catch (err: any) {
    console.error('[KB Buckets API] List error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server.' });
  }
});

/**
 * 3.3. POST /api/ai/kb/buckets
 * Tạo mới một bucket cho nhà hàng hoặc hệ thống
 */
router.post('/kb/buckets', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const { name, description, isChatEnabled } = req.body;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && req.body.restaurantId) {
      restaurantId = req.body.restaurantId as string;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên bucket không được bỏ trống.' });
    }

    const trimmedName = name.trim();
    // Validate name uniqueness
    const existing = await prisma.restaurantBucket.findFirst({
      where: { restaurantId, name: trimmedName }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Bucket với tên "${trimmedName}" đã tồn tại.` });
    }

    let slug = 'system';
    if (restaurantId !== 'system') {
      const rest = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true }
      });
      if (rest) {
        slug = rest.slug;
      }
    }

    const sanitizedName = trimmedName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    const url = `s3://${slug}/${sanitizedName}`;

    const bucket = await prisma.restaurantBucket.create({
      data: {
        restaurantId,
        name: trimmedName,
        url,
        description: description || null,
        isChatEnabled: isChatEnabled !== false
      }
    });

    return res.json({ success: true, data: bucket, message: `Đã tạo bucket "${trimmedName}" thành công.` });
  } catch (err: any) {
    console.error('[KB Buckets API] Create error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server.' });
  }
});

/**
 * 3.4. PATCH /api/ai/kb/buckets/:id
 * Cập nhật cấu hình bucket (Mô tả, Kích hoạt RAG)
 */
router.patch('/kb/buckets/:id', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let restaurantId = req.user?.restaurantId;
    const { description, isChatEnabled } = req.body;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && req.body.restaurantId) {
      restaurantId = req.body.restaurantId as string;
    }

    let bucket;
    if (isSystemAdmin) {
      bucket = await prisma.restaurantBucket.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      bucket = await prisma.restaurantBucket.findFirst({ where: { id, restaurantId } });
    }

    if (!bucket) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bucket hoặc không có quyền.' });
    }

    const updateData: any = {};
    if (description !== undefined) {
      updateData.description = description;
    }
    if (isChatEnabled !== undefined) {
      updateData.isChatEnabled = !!isChatEnabled;
    }

    const updated = await prisma.restaurantBucket.update({
      where: { id },
      data: updateData
    });

    return res.json({ success: true, data: updated, message: 'Đã cập nhật cấu hình bucket.' });
  } catch (err: any) {
    console.error('[KB Buckets API] Update error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server.' });
  }
});

/**
 * 3.45. DELETE /api/ai/kb/buckets/:id
 * Xóa bucket cùng toàn bộ tài liệu bên trong
 */
router.delete('/kb/buckets/:id', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let restaurantId = req.user?.restaurantId;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && req.query.restaurantId) {
      restaurantId = req.query.restaurantId as string;
    }

    let bucket;
    if (isSystemAdmin) {
      bucket = await prisma.restaurantBucket.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      bucket = await prisma.restaurantBucket.findFirst({ where: { id, restaurantId } });
    }

    if (!bucket) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bucket hoặc không có quyền.' });
    }

    await prisma.restaurantBucket.delete({ where: { id } });
    return res.json({ success: true, message: `Đã xóa bucket "${bucket.name}" cùng các tài liệu bên trong.` });
  } catch (err: any) {
    console.error('[KB Buckets API] Delete error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server.' });
  }
});

/**
 * 3.455. POST /api/ai/kb/buckets/:id/process
 * Kích hoạt Knowledge Base (Mount) cho bucket và thực hiện chunking/embedding toàn bộ tài liệu có sẵn
 */
router.post('/kb/buckets/:id/process', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let restaurantId = req.user?.restaurantId;
    const { chunkingStrategy, chunkSize, chunkOverlap } = req.body;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    
    if (isSystemAdmin && req.body.restaurantId) {
      restaurantId = req.body.restaurantId as string;
    }

    let bucket;
    if (isSystemAdmin) {
      bucket = await prisma.restaurantBucket.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      bucket = await prisma.restaurantBucket.findFirst({ where: { id, restaurantId } });
    }

    if (!bucket) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bucket hoặc không có quyền.' });
    }

    const strategy = chunkingStrategy || 'FIXED';
    const size = chunkSize !== undefined ? Number(chunkSize) : 800;
    const overlap = chunkOverlap !== undefined ? Number(chunkOverlap) : 100;

    // Cập nhật cấu hình mount trên bucket
    await prisma.restaurantBucket.update({
      where: { id },
      data: {
        isMounted: true,
        chunkingStrategy: strategy,
        chunkSize: size,
        chunkOverlap: overlap
      }
    });

    // Lấy toàn bộ tài liệu trong bucket
    const documents = await prisma.restaurantDocument.findMany({
      where: { bucketId: id }
    });

    const { UploadQueueService } = await import('../../services/uploadQueue.service');

    for (const doc of documents) {
      // Xóa các chunk cũ
      await prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });

      // Đặt trạng thái PROCESSING
      await prisma.restaurantDocument.update({
        where: { id: doc.id },
        data: { status: 'PROCESSING' }
      });

      // Queue xử lý
      await UploadQueueService.addUploadJob({
        documentId: doc.id,
        restaurantId: doc.restaurantId,
        filename: doc.filename,
        fileUrl: doc.fileUrl,
        fileType: doc.fileType as 'PDF' | 'TXT' | 'MD',
        chunkingStrategy: strategy,
        chunkSize: size,
        chunkOverlap: overlap
      });
    }

    return res.json({
      success: true,
      message: `Đã kích hoạt Knowledge Base và bắt đầu xử lý phân tách ${documents.length} tài liệu với chế độ ${strategy}.`
    });
  } catch (err: any) {
    console.error('[KB Buckets API] Process/Mount error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi kích hoạt Knowledge Base.' });
  }
});

/**
 * 3.46. POST /api/ai/kb/buckets/:id/sync
 * Đồng bộ lại toàn bộ tài liệu trong bucket (xóa chunk cũ, re-process lại theo cấu hình lưu trữ)
 */
router.post('/kb/buckets/:id/sync', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let restaurantId = req.user?.restaurantId;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    if (isSystemAdmin && (req.body.restaurantId || req.query.restaurantId)) {
      restaurantId = req.body.restaurantId || req.query.restaurantId;
    }

    // Find the bucket
    let bucket;
    if (isSystemAdmin) {
      bucket = await prisma.restaurantBucket.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      bucket = await prisma.restaurantBucket.findFirst({ where: { id, restaurantId } });
    }

    if (!bucket) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bucket hoặc không có quyền.' });
    }

    // Find all documents in the bucket
    const documents = await prisma.restaurantDocument.findMany({
      where: {
        bucketId: id,
        status: { in: ['INDEXED', 'FAILED', 'STORED', 'PROCESSING'] },
      },
    });

    if (documents.length === 0) {
      return res.json({ success: true, message: 'Không có tài liệu nào cần đồng bộ lại.', data: { syncedCount: 0 } });
    }

    const { UploadQueueService } = await import('../../services/uploadQueue.service');

    for (const doc of documents) {
      // Delete existing chunks
      await prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });

      // Reset document status to PROCESSING
      await prisma.restaurantDocument.update({ where: { id: doc.id }, data: { status: 'PROCESSING' } });

      // Queue document for re-processing using the bucket configurations
      await UploadQueueService.addUploadJob({
        documentId: doc.id,
        restaurantId: doc.restaurantId,
        filename: doc.filename,
        fileUrl: doc.fileUrl,
        fileType: doc.fileType as 'PDF' | 'TXT' | 'MD',
        chunkingStrategy: bucket.chunkingStrategy,
        chunkSize: bucket.chunkSize,
        chunkOverlap: bucket.chunkOverlap
      });
    }

    return res.json({
      success: true,
      message: `Đang đồng bộ lại ${documents.length} tài liệu...`,
      data: { syncedCount: documents.length },
    });
  } catch (err: any) {
    console.error('[KB Buckets API] Sync error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi đồng bộ lại tài liệu.' });
  }
});

/**
 * 3.5. GET /api/ai/kb/documents/:id/chunks
 * Lấy danh sách các chunk đã phân tách của tài liệu để xem trước
 */
router.get('/kb/documents/:id/chunks', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;

    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');

    // Verify document ownership
    let doc;
    if (isSystemAdmin) {
      doc = await prisma.restaurantDocument.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      doc = await prisma.restaurantDocument.findFirst({ where: { id, restaurantId } });
    }

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu hoặc không có quyền truy cập.' });
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    return res.json({ success: true, data: chunks });
  } catch (err) {
    console.error('[KB API] Get chunks error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * 3.6. GET /api/ai/kb/documents/:id/raw
 * Lấy nội dung văn bản thô của tài liệu (TXT/MD) để xem trước
 */
router.get('/kb/documents/:id/raw', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;

    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');

    let doc;
    if (isSystemAdmin) {
      doc = await prisma.restaurantDocument.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      doc = await prisma.restaurantDocument.findFirst({ where: { id, restaurantId } });
    }

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu hoặc không có quyền truy cập.' });
    }

    const { UploadQueueService } = await import('../../services/uploadQueue.service');
    const buffer = await UploadQueueService.getFileBuffer(doc.fileUrl);
    const text = buffer.toString('utf-8');

    return res.json({ success: true, data: text });
  } catch (err: any) {
    console.error('[KB API] Get raw content error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi tải nội dung file.' });
  }
});

/**
 * 4. POST /api/ai/chat/system
 * API Chat của hệ thống XFoodi (Dùng cho chatbot trả lời chung trên trang chủ - Hỗ trợ SSE Streaming)
 */
router.post('/chat/system', async (req: any, res: any) => {
  try {
    const { query, history } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, message: 'Truy vấn không được bỏ trống.' });
    }

    const isSSE = req.headers.accept === 'text/event-stream';
    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const stream = RAGService.querySystemStream(query, history || []);
      for await (const chunk of stream) {
        if (chunk.error) {
          res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
          break;
        }
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
        if (chunk.done) {
          break;
        }
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const result = await RAGService.querySystem(query, history || []);
    return res.json(result);
  } catch (err) {
    console.error('[Chat API] System chat error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * 5. POST /api/ai/chat/restaurant
 * API Chat RAG riêng cho từng nhà hàng (quét QR code tại bàn - Hỗ trợ SSE Streaming)
 */
router.post('/chat/restaurant', async (req: any, res: any) => {
  try {
    const { restaurantId, query, history, userPreferences, sessionId } = req.body;
    if (!restaurantId || !query) {
      return res.status(400).json({ success: false, message: 'restaurantId và query không được bỏ trống.' });
    }

    const isSSE = req.headers.accept === 'text/event-stream';
    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const stream = RAGService.queryRestaurantStream(restaurantId, query, history || [], userPreferences, sessionId);
      for await (const chunk of stream) {
        if (chunk.error) {
          res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
          break;
        }
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
        if (chunk.done) {
          break;
        }
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const result = await RAGService.queryRestaurant(restaurantId, query, history || [], userPreferences, sessionId);
    return res.json(result);
  } catch (err) {
    console.error('[Chat API] Restaurant chat error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});


/**
 * GET /api/ai/config
 * Lấy cấu hình AI chatbot của nhà hàng hoặc hệ thống (Công khai)
 */
router.get('/config', async (req: any, res: any) => {
  try {
    const restaurantId = req.query.restaurantId as string;

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Thiếu restaurantId.' });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { metadata: true, name: true }
    });

    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    const metadata = (restaurant.metadata as any) || {};
    const defaultSuggestions = restaurantId === 'system'
      ? ['Tính năng XFoodi 💡', 'Gói dịch vụ 🏷️', 'Cách đăng ký 📋']
      : ['Xem thực đơn 📜', 'Giờ mở cửa 🕐', 'Đặt bàn 📅', 'Gọi phục vụ 🔔'];
    const aiConfig = metadata.aiConfig
      ? { quickSuggestions: defaultSuggestions, ...metadata.aiConfig }
      : {
          isChatEnabled: true,
          aiModel: ENV.AI.DEFAULT_MODEL,
          temperature: restaurantId === 'system' ? ENV.AI.DEFAULT_TEMPERATURE : 0.2,
          welcomeMessage: restaurantId === 'system'
            ? 'Trợ lý ảo hỗ trợ tìm hiểu về nền tảng SaaS quản lý nhà hàng XFoodi. Hãy hỏi tôi về các gói dịch vụ, giá thành hoặc cách đăng ký ngay!'
            : `Chào mừng bạn đến với ${restaurant.name}! Tôi có thể tư vấn món ăn ngon, cách đặt bàn hay kết nối trực tiếp đến nhân viên phục vụ giúp bạn.`,
          systemPrompt: '',
          quickSuggestions: defaultSuggestions
        };

    return res.json({ success: true, data: aiConfig });
  } catch (err: any) {
    console.error('[AI Config API] Get error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

/**
 * POST /api/ai/config
 * Cập nhật cấu hình AI chatbot của nhà hàng hoặc hệ thống
 */
router.post('/config', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    let restaurantId = req.user?.restaurantId;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    
    if (isSystemAdmin && req.body.restaurantId) {
      restaurantId = req.body.restaurantId;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    const { isChatEnabled, aiModel, temperature, welcomeMessage, systemPrompt, quickSuggestions } = req.body;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });

    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
    }

    const metadata = (restaurant.metadata as any) || {};
    metadata.aiConfig = {
      isChatEnabled: isChatEnabled ?? true,
      aiModel: aiModel || ENV.AI.DEFAULT_MODEL,
      temperature: temperature !== undefined ? Number(temperature) : 0.2,
      welcomeMessage: welcomeMessage || '',
      systemPrompt: systemPrompt || '',
      quickSuggestions: Array.isArray(quickSuggestions) ? quickSuggestions : []
    };

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { metadata }
    });

    return res.json({ success: true, message: 'Cập nhật cấu hình AI thành công!', data: metadata.aiConfig });
  } catch (err: any) {
    console.error('[AI Config API] Update error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});


/**
 * 6. POST /api/ai/kb/buckets/:id/test/retrieve
 * Chế độ 1: Kiểm tra tìm kiếm tài liệu (Retrieve Only)
 */
router.post('/kb/buckets/:id/test/retrieve', authMiddleware, tenantGuard, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { query, retrievalSource } = req.body;
    const activeSource = retrievalSource || "document";

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Truy vấn không được bỏ trống.' });
    }

    let restaurantId = req.user?.restaurantId;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    
    if (isSystemAdmin && (req.body.restaurantId || req.query.restaurantId)) {
      restaurantId = req.body.restaurantId || req.query.restaurantId;
    }

    // Find the bucket
    let bucket;
    if (isSystemAdmin) {
      bucket = await prisma.restaurantBucket.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      bucket = await prisma.restaurantBucket.findFirst({ where: { id, restaurantId } });
    }

    if (!bucket) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bucket hoặc không có quyền.' });
    }

    let chunks: any[] = [];

    if (activeSource === "database") {
      const dbDishes = await prisma.dish.findMany({
        where: { restaurantId: bucket.restaurantId, isActive: true },
        select: { name: true, price: true, unit: true, description: true },
        take: 10
      });
      const dbCombos = await prisma.mealCombo.findMany({
        where: { restaurantId: bucket.restaurantId, isActive: true },
        select: { name: true, price: true, description: true },
        take: 5
      });

      const keywords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1);
      let matchedDishes = dbDishes.filter(d => 
        keywords.length === 0 || keywords.some((k: string) => d.name.toLowerCase().includes(k) || (d.description && d.description.toLowerCase().includes(k)))
      );
      let matchedCombos = dbCombos.filter(c => 
        keywords.length === 0 || keywords.some((k: string) => c.name.toLowerCase().includes(k) || (c.description && c.description.toLowerCase().includes(k)))
      );

      if (matchedDishes.length === 0 && matchedCombos.length === 0) {
        matchedDishes = dbDishes.slice(0, 3);
        matchedCombos = dbCombos.slice(0, 2);
      }

      chunks = [
        ...matchedDishes.map((d, index) => ({
          content: `[Món ăn] Tên: ${d.name} | Giá: ${Number(d.price).toLocaleString('vi-VN')} VNĐ | Đvt: ${d.unit || 'phần'}\nMô tả: ${d.description || 'Không có mô tả.'}`,
          filename: 'DB: menu_dishes.sql',
          rrf_score: 1.0 / (1.0 + index)
        })),
        ...matchedCombos.map((c, index) => ({
          content: `[Combo] Tên: ${c.name} | Giá: ${Number(c.price).toLocaleString('vi-VN')} VNĐ\nMô tả: ${c.description || 'Không có mô tả.'}`,
          filename: 'DB: menu_combos.sql',
          rrf_score: 1.0 / (1.5 + index)
        }))
      ];
    } else if (activeSource === "api") {
      const metrics = [
        { service: "POS_Service", status: "ONLINE", uptime_percent: 99.98, latency_ms: 12, active_connections: 5, description: "Hệ thống POS bán hàng tại quầy và đồng bộ đơn hàng." },
        { service: "KDS_KitchenSvc", status: "ONLINE", uptime_percent: 99.95, latency_ms: 34, pending_tickets: 3, description: "Màn hình hiển thị bếp chế biến món ăn thời gian thực." },
        { service: "PaymentGateway_PayOS", status: "ONLINE", uptime_percent: 100.0, latency_ms: 120, webhook_status: "ACTIVE", description: "Cổng thanh toán QR Code PayOS tự động đối soát." },
        { service: "QR_OrderingAPI", status: "ONLINE", uptime_percent: 99.9, latency_ms: 45, active_sessions: 12, description: "API tiếp nhận đơn đặt món QR tại bàn của khách hàng." }
      ];
      chunks = metrics.map((m, index) => ({
        content: `[API Health] Dịch vụ: ${m.service} | Trạng thái: ${m.status} | Uptime: ${m.uptime_percent}% | Trễ: ${m.latency_ms}ms\nMô tả: ${m.description}`,
        filename: `API: live_${m.service.toLowerCase()}_health.json`,
        rrf_score: 1.0 / (1.0 + index)
      }));
    } else {
      // Generate Embedding
      const queryEmbedding = await AIService.generateEmbedding(query);
      const queryVectorStr = `[${queryEmbedding.join(',')}]`;

      // Hybrid RRF Search
      const dbChunks = await prisma.$queryRawUnsafe<any[]>(
        `WITH vector_matches AS (
          SELECT dc.id, ROW_NUMBER() OVER (ORDER BY dc.embedding <=> $1::vector) as rank
          FROM "DocumentChunks" dc
          JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
          WHERE rd."bucketId" = $2 AND rd.status = 'INDEXED'
          LIMIT 100
        ),
        text_matches AS (
          SELECT dc.id, ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', $3)) DESC) as rank
          FROM "DocumentChunks" dc
          JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
          WHERE rd."bucketId" = $2 AND rd.status = 'INDEXED'
            AND to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $3)
          LIMIT 100
        )
        SELECT dc.content, rd.filename, dc."documentId" as "documentId",
               (COALESCE(1.0 / (60.0 + vm.rank), 0.0) + COALESCE(1.0 / (60.0 + tm.rank), 0.0)) as rrf_score
        FROM "DocumentChunks" dc
        JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
        LEFT JOIN vector_matches vm ON dc.id = vm.id
        LEFT JOIN text_matches tm ON dc.id = tm.id
        WHERE vm.id IS NOT NULL OR tm.id IS NOT NULL
        ORDER BY rrf_score DESC
        LIMIT 10`,
        queryVectorStr,
        id,
        query
      );

      let rerankedChunks = dbChunks || [];
      if (rerankedChunks.length > 0) {
        try {
          const documentTexts = rerankedChunks.map(c => c.content);
          const rerankedResults = await AIService.cohereRerank(
            query,
            documentTexts,
            ENV.AI.RAG_MAX_CHUNKS || 5
          );
          rerankedChunks = rerankedResults.map(r => {
            const chunk = rerankedChunks[r.index];
            if (chunk) {
              return { ...chunk, cohere_score: r.score };
            }
            return null;
          }).filter((c): c is any => !!c);
        } catch (rerankErr) {
          console.warn('[KB Test API] Cohere Rerank failed in retrieve:', rerankErr);
        }
      }
      chunks = rerankedChunks;
    }

    return res.json({ success: true, chunks });
  } catch (err: any) {
    console.error('[KB Test API] Retrieve error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi thử nghiệm tìm kiếm.' });
  }
});

/**
 * 7. POST /api/ai/kb/buckets/:id/test/rag
 * Chế độ 2: Chạy toàn bộ pipeline RAG AI cho câu hỏi của người dùng và trả về trace debug
 */
router.post('/kb/buckets/:id/test/rag', authMiddleware, tenantGuard, async (req: any, res: any) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { query, history, retrievalSource } = req.body;
    const activeSource = retrievalSource || "document";

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Truy vấn không được bỏ trống.' });
    }

    let restaurantId = req.user?.restaurantId;
    const userRoles = Array.isArray(req.user?.roles) ? req.user?.roles : req.user?.role ? [req.user.role] : [];
    const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin') || userRoles.includes('System Admin');
    
    if (isSystemAdmin && (req.body.restaurantId || req.query.restaurantId)) {
      restaurantId = req.body.restaurantId || req.query.restaurantId;
    }

    // Find the bucket
    let bucket;
    if (isSystemAdmin) {
      bucket = await prisma.restaurantBucket.findUnique({ where: { id } });
    } else {
      if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy nhà hàng.' });
      }
      bucket = await prisma.restaurantBucket.findFirst({ where: { id, restaurantId } });
    }

    if (!bucket) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bucket hoặc không có quyền.' });
    }

    const trace: any = {
      isSafe: true,
      rewrittenQuery: query,
      chunks: [],
      systemInstruction: '',
      isReranked: false,
      retrievalSource: activeSource
    };

    // 1. Rewrite Query (L4 Pronoun Resolution)
    const activeHistory = history || [];
    const historyForRewriter = activeHistory
      .filter((h: any) => h.role !== 'system')
      .map((h: any) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.content,
      }));
    const rewrittenQuery = await AIService.rewriteQuery(query, historyForRewriter);
    trace.rewrittenQuery = rewrittenQuery;

    // 2. Anti-injection check (Security Guardrail)
    const isSafe = await AIService.checkPromptInjection(rewrittenQuery);
    trace.isSafe = isSafe;
    if (!isSafe) {
      return res.json({
        success: false,
        answer: 'Hệ thống phát hiện nội dung truy vấn không an toàn. Vui lòng đặt câu hỏi khác.',
        trace
      });
    }

    // 3. Retrieve chunks based on selected source (L1-L3)
    let chunks: any[] = [];
    let isReranked = false;

    if (activeSource === "database") {
      const dbDishes = await prisma.dish.findMany({
        where: { restaurantId: bucket.restaurantId, isActive: true },
        select: { name: true, price: true, unit: true, description: true },
        take: 10
      });
      const dbCombos = await prisma.mealCombo.findMany({
        where: { restaurantId: bucket.restaurantId, isActive: true },
        select: { name: true, price: true, description: true },
        take: 5
      });

      const keywords = rewrittenQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1);
      let matchedDishes = dbDishes.filter(d => 
        keywords.length === 0 || keywords.some((k: string) => d.name.toLowerCase().includes(k) || (d.description && d.description.toLowerCase().includes(k)))
      );
      let matchedCombos = dbCombos.filter(c => 
        keywords.length === 0 || keywords.some((k: string) => c.name.toLowerCase().includes(k) || (c.description && c.description.toLowerCase().includes(k)))
      );

      if (matchedDishes.length === 0 && matchedCombos.length === 0) {
        matchedDishes = dbDishes.slice(0, 3);
        matchedCombos = dbCombos.slice(0, 2);
      }

      chunks = [
        ...matchedDishes.map((d, index) => ({
          content: `[Món ăn] Tên: ${d.name} | Giá: ${Number(d.price).toLocaleString('vi-VN')} VNĐ | Đvt: ${d.unit || 'phần'}\nMô tả: ${d.description || 'Không có mô tả.'}`,
          filename: 'DB: menu_dishes.sql',
          rrf_score: 1.0 / (1.0 + index)
        })),
        ...matchedCombos.map((c, index) => ({
          content: `[Combo] Tên: ${c.name} | Giá: ${Number(c.price).toLocaleString('vi-VN')} VNĐ\nMô tả: ${c.description || 'Không có mô tả.'}`,
          filename: 'DB: menu_combos.sql',
          rrf_score: 1.0 / (1.5 + index)
        }))
      ];
      isReranked = false; // Bypassed for DB query
    } else if (activeSource === "api") {
      const metrics = [
        { service: "POS_Service", status: "ONLINE", uptime_percent: 99.98, latency_ms: 12, active_connections: 5, description: "Hệ thống POS bán hàng tại quầy và đồng bộ đơn hàng." },
        { service: "KDS_KitchenSvc", status: "ONLINE", uptime_percent: 99.95, latency_ms: 34, pending_tickets: 3, description: "Màn hình hiển thị bếp chế biến món ăn thời gian thực." },
        { service: "PaymentGateway_PayOS", status: "ONLINE", uptime_percent: 100.0, latency_ms: 120, webhook_status: "ACTIVE", description: "Cổng thanh toán QR Code PayOS tự động đối soát." },
        { service: "QR_OrderingAPI", status: "ONLINE", uptime_percent: 99.9, latency_ms: 45, active_sessions: 12, description: "API tiếp nhận đơn đặt món QR tại bàn của khách hàng." }
      ];
      chunks = metrics.map((m, index) => ({
        content: `[API Health] Dịch vụ: ${m.service} | Trạng thái: ${m.status} | Uptime: ${m.uptime_percent}% | Trễ: ${m.latency_ms}ms\nMô tả: ${m.description}`,
        filename: `API: live_${m.service.toLowerCase()}_health.json`,
        rrf_score: 1.0 / (1.0 + index)
      }));
      isReranked = false; // Bypassed for API monitoring
    } else {
      // Standard document search inside bucket (Document KB)
      const queryEmbedding = await AIService.generateEmbedding(rewrittenQuery);
      const queryVectorStr = `[${queryEmbedding.join(',')}]`;

      const dbChunks = await prisma.$queryRawUnsafe<any[]>(
        `WITH vector_matches AS (
          SELECT dc.id, ROW_NUMBER() OVER (ORDER BY dc.embedding <=> $1::vector) as rank
          FROM "DocumentChunks" dc
          JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
          WHERE rd."bucketId" = $2 AND rd.status = 'INDEXED'
          LIMIT 100
        ),
        text_matches AS (
          SELECT dc.id, ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', $3)) DESC) as rank
          FROM "DocumentChunks" dc
          JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
          WHERE rd."bucketId" = $2 AND rd.status = 'INDEXED'
            AND to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $3)
          LIMIT 100
        )
        SELECT dc.content, rd.filename, dc."documentId" as "documentId",
               (COALESCE(1.0 / (60.0 + vm.rank), 0.0) + COALESCE(1.0 / (60.0 + tm.rank), 0.0)) as rrf_score
        FROM "DocumentChunks" dc
        JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
        LEFT JOIN vector_matches vm ON dc.id = vm.id
        LEFT JOIN text_matches tm ON dc.id = tm.id
        WHERE vm.id IS NOT NULL OR tm.id IS NOT NULL
        ORDER BY rrf_score DESC
        LIMIT 10`,
        queryVectorStr,
        id,
        rewrittenQuery
      );

      let rerankedChunks = dbChunks || [];
      if (rerankedChunks.length > 0) {
        try {
          const documentTexts = rerankedChunks.map(c => c.content);
          const rerankedResults = await AIService.cohereRerank(
            rewrittenQuery,
            documentTexts,
            ENV.AI.RAG_MAX_CHUNKS || 5
          );
          rerankedChunks = rerankedResults.map(r => {
            const chunk = rerankedChunks[r.index];
            if (chunk) {
              return { ...chunk, cohere_score: r.score };
            }
            return null;
          }).filter((c): c is any => !!c);
          isReranked = true;
        } catch (rerankErr) {
          console.warn('[KB Test API] Cohere Rerank failed in RAG test:', rerankErr);
        }
      }
      chunks = rerankedChunks;
    }

    trace.isReranked = isReranked;
    const topChunks = chunks.slice(0, ENV.AI.RAG_MAX_CHUNKS);
    trace.chunks = topChunks;

    // 4. Build system prompt
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: bucket.restaurantId },
      select: { name: true, metadata: true }
    });

    const metadata = (restaurant?.metadata as any) || {};
    const aiConfig = metadata.aiConfig || {};

    const defaultSystemPrompt = `Bạn là trợ lý AI thông minh của nhà hàng "${restaurant?.name || 'XFoodi'}".
Nhiệm vụ của bạn là hỗ trợ khách hàng tìm hiểu thực đơn, giá cả các món ăn, hướng dẫn đặt bàn và các dịch vụ đi kèm.
Hãy luôn lịch sự, thân thiện và nhiệt tình với khách hàng.`;

    const customPrompt = aiConfig.systemPrompt || defaultSystemPrompt;

    let contextText = '';
    if (activeSource === "database") {
      contextText = topChunks.map((c) => `[Dữ liệu Menu Cửa Hàng]\n${c.content}`).join('\n\n---\n\n');
    } else if (activeSource === "api") {
      contextText = topChunks.map((c) => `[Dữ liệu Trạng Thái API Live]\n${c.content}`).join('\n\n---\n\n');
    } else {
      contextText = topChunks.length > 0
        ? topChunks.map((c) => `[Tài liệu: ${c.filename}]\n${c.content}`).join('\n\n---\n\n')
        : 'Không có tài liệu tham khảo đặc thù nào.';
    }

    let menuContextText = '';
    if (bucket.restaurantId !== 'system') {
      const activeDishes = await prisma.dish.findMany({
        where: { restaurantId: bucket.restaurantId, isActive: true },
        select: { id: true, name: true, price: true, unit: true },
        take: 50
      });

      const activeCombos = await prisma.mealCombo.findMany({
        where: { restaurantId: bucket.restaurantId, isActive: true },
        select: { id: true, name: true, price: true },
        take: 20
      });

      if (activeDishes.length > 0 || activeCombos.length > 0) {
        const menuList = [
          ...activeDishes.map(d => ({ type: 'dish', id: d.id, name: d.name, price: Number(d.price), unit: d.unit })),
          ...activeCombos.map(c => ({ type: 'combo', id: c.id, name: c.name, price: Number(c.price), unit: 'phần' }))
        ];
        menuContextText = `\nDanh sách món ăn & combo có sẵn tại nhà hàng:\n${JSON.stringify(menuList, null, 2)}`;
      }
    }

    const systemInstruction = `${customPrompt}

Ngữ cảnh tài liệu nhà hàng hỗ trợ (Knowledge Base Context) từ bucket "${bucket.name}":
========================================
${contextText}
========================================

${menuContextText}

QUY TẮC QUAN TRỌNG:
1. Chỉ trả lời dựa trên thông tin thực tế từ Ngữ cảnh tài liệu và Danh sách món ăn/combo có sẵn ở trên. Nếu không biết hoặc thông tin không có trong tài liệu/thực đơn, hãy trả lời lịch sự rằng bạn không có thông tin chính xác và khuyên khách hỏi nhân viên phục vụ.
2. KHÔNG tự bịa đặt món ăn, giá cả hoặc chính sách không có trong ngữ cảnh.`;

    trace.systemInstruction = systemInstruction;

    // Assemble content for LLM call
    const contents: any[] = [];
    for (const msg of activeHistory) {
      if (msg.role === 'system') continue;
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: rewrittenQuery }],
    });

    const response = await AIService.generateContent({
      model: aiConfig.aiModel || ENV.AI.DEFAULT_MODEL,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.2,
      }
    });

    const fullAnswer = response.text ? response.text.trim() : '';

    // Mask PII
    const sanitizedAnswer = await AIService.validatePII(fullAnswer);

    // Calculate latency & run RAGAS-style evaluation
    trace.latency = Date.now() - startTime;
    trace.evaluation = await AIService.ragasEvaluate(rewrittenQuery, sanitizedAnswer, topChunks);

    return res.json({
      success: true,
      answer: sanitizedAnswer,
      trace
    });
  } catch (err: any) {
    console.error('[KB Test API] RAG error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi thử nghiệm RAG.' });
  }
});

export default router;
