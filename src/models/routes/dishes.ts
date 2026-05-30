import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import {
  handleCreateDish,
  handleListDishes,
  handleGetDishDetail,
  handleUpdateDish,
  handleDeleteDish,
} from '../../controllers/dish.controller';

const router: ExpressRouter = Router();

// Public (menu browsing)
router.get('/', handleListDishes);
router.get('/:id', handleGetDishDetail);

// Protected (owner/staff operations)
router.post('/', authMiddleware, handleCreateDish);
router.put('/:id', authMiddleware, handleUpdateDish);
router.delete('/:id', authMiddleware, handleDeleteDish);

export default router;
