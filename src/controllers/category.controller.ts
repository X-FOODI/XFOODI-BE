import type { RequestHandler } from 'express';
import {
  createCategory,
  listCategories,
  getCategoryDetail,
  updateCategory,
  deleteCategory,
  CategoryServiceError,
} from '../services/category.service';
import {
  validateCreateCategory,
  validateUpdateCategory,
} from '../validators/category.validator';
import type { CreateCategoryBody, UpdateCategoryBody } from '../types/category.types';

// ─── Helper: Extract Restaurant ID from Request ──────────────────────────────

function getRestaurantId(req: any): string | null {
  // Primary source: Authenticated user's restaurant context from JWT
  if (req.user?.restaurantId) {
    return req.user.restaurantId as string;
  }
  // Secondary source: supplied explicitly (e.g., by an Admin user)
  if (req.body?.restaurantId) {
    return req.body.restaurantId as string;
  }
  if (req.query?.restaurantId) {
    return req.query.restaurantId as string;
  }
  return null;
}

// ─── Helper: Standardized Service Error Handler ──────────────────────────────

function handleCategoryError(res: any, err: unknown): void {
  if (err instanceof CategoryServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  const error = err as Error;
  console.error('[CategoryController] Error:', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

// ─── Controller Endpoints ──────────────────────────────────────────────────────

/**
 * POST /api/categories
 * Creates a new category.
 */
export const handleCreateCategory: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required. Please login as a restaurant owner or provide restaurantId.',
      });
    }

    const body = req.body as CreateCategoryBody;

    // Validate body payload
    const { valid, errors } = validateCreateCategory(body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; '),
      });
    }

    const created = await createCategory(restaurantId, body);

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: created,
    });
  } catch (err) {
    handleCategoryError(res, err);
  }
};

/**
 * GET /api/categories
 * Lists categories with pagination, search, and status filter.
 */
export const handleListCategories: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required. Please provide a restaurantId in query parameters.',
      });
    }

    const query = req.query as any;
    const paginatedResult = await listCategories(restaurantId, query);

    res.json({
      success: true,
      ...paginatedResult,
    });
  } catch (err) {
    handleCategoryError(res, err);
  }
};

/**
 * GET /api/categories/:id
 * Fetches the detail profile of a category.
 */
export const handleGetCategoryDetail: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.',
      });
    }

    const id = req.params.id as string;
    const detail = await getCategoryDetail(restaurantId, id);

    res.json({
      success: true,
      data: detail,
    });
  } catch (err) {
    handleCategoryError(res, err);
  }
};

/**
 * PUT /api/categories/:id
 * Updates an existing category.
 */
export const handleUpdateCategory: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.',
      });
    }

    const id = req.params.id as string;
    const body = req.body as UpdateCategoryBody;

    // Validate body payload
    const { valid, errors } = validateUpdateCategory(body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; '),
      });
    }

    const updated = await updateCategory(restaurantId, id, body);

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: updated,
    });
  } catch (err) {
    handleCategoryError(res, err);
  }
};

/**
 * DELETE /api/categories/:id
 * Safely deletes a category (or blocks if assigned to dishes).
 */
export const handleDeleteCategory: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.',
      });
    }

    const id = req.params.id as string;
    await deleteCategory(restaurantId, id);

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (err) {
    handleCategoryError(res, err);
  }
};
