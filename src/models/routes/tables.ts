import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import {
  handleListTables,
  handleCreateTable,
  handleUpdateTable,
  handleDeleteTable,
  handleCreateSession,
  handleMergeSessions,
  handleTransferSession,
  handleCloseSession,
  handleGetPublicTableDetail,
} from '../../controllers/table.controller';

const router: ExpressRouter = Router();

// Public route for customers scanning QR code
router.get('/public/:id', handleGetPublicTableDetail);

// Apply authMiddleware and tenantGuard to all subsequent table routes
router.use(authMiddleware);
router.use(tenantGuard);

// Table CRUD
router.get('/', handleListTables);
router.post('/', handleCreateTable);
router.put('/:id', handleUpdateTable);
router.delete('/:id', handleDeleteTable);

// Table Sessions
router.post('/sessions', handleCreateSession);
router.post('/sessions/merge', handleMergeSessions);
router.post('/sessions/transfer', handleTransferSession);
router.post('/sessions/close', handleCloseSession);

export default router;
