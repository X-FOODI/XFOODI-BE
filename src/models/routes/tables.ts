import { Router, type RequestHandler } from 'express';
import type { Router as ExpressRouter } from 'express';
import multer from 'multer';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import { prismaStorage, centralPrisma } from '../../lib/prisma';
import {
  handleListTables,
  handleGetTableById,
  handleCreateTable,
  handleUpdateTable,
  handleUpdateTableStatus,
  handleDeleteTable,
  handleBulkDeleteTables,
  handleGetSessions,
  handleCreateSessionByTableId,
  handleCloseSessions,
  handleMergeTables,
  handleMoveTable,
  handleGetPublicTableDetail,
} from '../../controllers/table.controller';

const router: ExpressRouter = Router();

const tableUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — supports high-res panorama images
});

// Multer error handler — converts MulterError (e.g. LIMIT_FILE_SIZE) into a clean JSON 413
function multerErrorHandler(err: any, req: any, res: any, next: any) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File quá lớn. Kích thước tối đa cho phép là 50MB.',
    });
  }
  if (err) {
    console.error('[Multer Error]', err);
    return res.status(400).json({ success: false, message: err.message || 'Lỗi upload file.' });
  }
  next();
}

/**
 * Wraps a multer middleware to preserve the AsyncLocalStorage context.
 * Multer internally uses streams/callbacks that can break out of the
 * AsyncLocalStorage execution context, causing prismaStorage.getStore()
 * to return undefined in downstream handlers.
 *
 * This wrapper captures the active store BEFORE multer runs and re-runs
 * prismaStorage.run() AFTER multer completes so the context is restored.
 */
function withContextPreserved(multerMiddleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const activeClient = prismaStorage.getStore() || centralPrisma;
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);
      prismaStorage.run(activeClient, () => {
        next();
      });
    });
  };
}

// Public route for customers scanning QR code
router.get('/public/:id', handleGetPublicTableDetail);

router.use(authMiddleware);
router.use(tenantGuard);

// Session routes (must be registered before /:id to avoid conflicts)
router.get('/sessions', handleGetSessions);
router.put('/sessions/close', handleCloseSessions);
router.post('/merge', handleMergeTables);
router.post('/move', handleMoveTable);
router.post('/:tableId/sessions', handleCreateSessionByTableId);

// Table CRUD
router.get('/', handleListTables);
router.post('/', handleCreateTable);
// Bulk delete must come before /:id to avoid route conflict
router.delete('/', handleBulkDeleteTables);
router.get('/:id', handleGetTableById);
router.put('/:id/status', handleUpdateTableStatus);
router.put('/:id', withContextPreserved(tableUpload.any() as RequestHandler), multerErrorHandler, handleUpdateTable);
router.delete('/:id', handleDeleteTable);

export default router;
