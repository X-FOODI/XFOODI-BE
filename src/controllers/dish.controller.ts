import type { RequestHandler } from 'express';
import {
  createDish,
  listDishes,
  getDishDetail,
  updateDish,
  deleteDish,
  DishServiceError,
} from '../services/dish.service';
import { validateCreateDish, validateUpdateDish } from '../validators/dish.validator';
import type { CreateDishBody, UpdateDishBody } from '../types/dish.types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getRestaurantId(req: any): string | null {
  return req.user?.restaurantId ?? req.body?.restaurantId ?? req.query?.restaurantId ?? null;
}

function handleError(res: any, err: unknown): void {
  if (err instanceof DishServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }
  const error = err as Error;
  console.error('[DishController]', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

/** POST /api/dishes */
export const handleCreateDish: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Restaurant ID is required' });

    const body = req.body as CreateDishBody;
    const { valid, errors } = validateCreateDish(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const created = await createDish(restaurantId, body);
    res.status(201).json({ success: true, message: 'Dish created successfully', data: created });
  } catch (err) { handleError(res, err); }
};

/** GET /api/dishes */
export const handleListDishes: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Restaurant ID is required' });

    const result = await listDishes(restaurantId, req.query as any);
    res.json({ success: true, ...result });
  } catch (err) { handleError(res, err); }
};

/** GET /api/dishes/:id */
export const handleGetDishDetail: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Restaurant ID is required' });

    const id = req.params.id as string;
    const data = await getDishDetail(restaurantId, id);
    res.json({ success: true, data });
  } catch (err) { handleError(res, err); }
};

/** PUT /api/dishes/:id */
export const handleUpdateDish: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Restaurant ID is required' });

    const id = req.params.id as string;
    const body = req.body as UpdateDishBody;
    const { valid, errors } = validateUpdateDish(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const updated = await updateDish(restaurantId, id, body);
    res.json({ success: true, message: 'Dish updated successfully', data: updated });
  } catch (err) { handleError(res, err); }
};

/** DELETE /api/dishes/:id */
export const handleDeleteDish: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Restaurant ID is required' });

    const id = req.params.id as string;
    await deleteDish(restaurantId, id);
    res.json({ success: true, message: 'Dish deleted successfully' });
  } catch (err) { handleError(res, err); }
};
