import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import multer from 'multer';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import {
  handleListTables,
  handleGetTableById,
  handleCreateTable,
  handleUpdateTable,
  handleUpdateTableStatus,
  handleDeleteTable,
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
router.get('/:id', handleGetTableById);
router.put('/:id/status', handleUpdateTableStatus);
router.put('/:id', tableUpload.any(), multerErrorHandler, handleUpdateTable);
router.delete('/:id', handleDeleteTable);

export default router;
