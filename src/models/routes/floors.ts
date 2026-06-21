import { Router, type RequestHandler } from 'express';
import type { Router as ExpressRouter } from 'express';
import multer from 'multer';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import { prismaStorage, centralPrisma } from '../../lib/prisma';
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
    // Capture the currently active Prisma client (set by TenantDbMiddleware)
    const activeClient = prismaStorage.getStore() || centralPrisma;

    // Run multer — it may drop the AsyncLocalStorage context internally
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);
      // Restore the captured context so downstream handlers see the correct store
      prismaStorage.run(activeClient, () => {
        next();
      });
    });
  };
}

router.use(authMiddleware);
router.use(tenantGuard);

router.get('/', handleListFloors);
router.post('/', withContextPreserved(floorUpload.single('Image') as RequestHandler), handleCreateFloor);
router.put('/:id', withContextPreserved(floorUpload.single('Image') as RequestHandler), handleUpdateFloor);
router.delete('/:id', handleDeleteFloor);
router.get('/:id/layout', handleGetFloorLayout);
router.put('/:id/layout', handleUpdateFloorLayout);

export default router;
