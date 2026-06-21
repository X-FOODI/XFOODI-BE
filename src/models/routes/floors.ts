import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import multer from 'multer';
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

const floorUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authMiddleware);
router.use(tenantGuard);

router.get('/', handleListFloors);
router.post('/', floorUpload.single('Image'), handleCreateFloor);
router.put('/:id', floorUpload.single('Image'), handleUpdateFloor);
router.delete('/:id', handleDeleteFloor);
router.get('/:id/layout', handleGetFloorLayout);
router.put('/:id/layout', handleUpdateFloorLayout);

export default router;
