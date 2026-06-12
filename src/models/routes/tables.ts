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
} from '../../controllers/table.controller';

const router: ExpressRouter = Router();

// Apply authMiddleware and tenantGuard to all table routes
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
