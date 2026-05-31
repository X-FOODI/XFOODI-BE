import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import {
  handleCreateCategory,
  handleListCategories,
  handleGetCategoryDetail,
  handleUpdateCategory,
  handleDeleteCategory,
} from '../../controllers/category.controller';

const router: ExpressRouter = Router();

// GET /api/categories - List categories (Public for menu browsing)
router.get('/', handleListCategories);

// GET /api/categories/:id - Get category detail (Public for menu browsing)
router.get('/:id', handleGetCategoryDetail);

// POST /api/categories - Create category (Protected, owner/staff required)
router.post('/', authMiddleware, handleCreateCategory);

// PUT /api/categories/:id - Update category (Protected, owner/staff required)
router.put('/:id', authMiddleware, handleUpdateCategory);

// DELETE /api/categories/:id - Safe delete category (Protected, owner/staff required)
router.delete('/:id', authMiddleware, handleDeleteCategory);

export default router;
