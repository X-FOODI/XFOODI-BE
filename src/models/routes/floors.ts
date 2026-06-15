import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import {
  handleListFloors,
  handleCreateFloor,
  handleUpdateFloor,
  handleDeleteFloor,
  handleGetFloorLayout,
  handleUpdateFloorLayout,
} from '../../controllers/table.controller';

const router: ExpressRouter = Router();

// Apply authMiddleware and tenantGuard to all floor routes
router.use(authMiddleware);
router.use(tenantGuard);

// Floor CRUD
router.get('/', handleListFloors);
router.post('/', handleCreateFloor);
router.put('/:id', handleUpdateFloor);
router.delete('/:id', handleDeleteFloor);

// Floor layout endpoints
router.get('/:id/layout', handleGetFloorLayout);
router.put('/:id/layout', handleUpdateFloorLayout);

export default router;
