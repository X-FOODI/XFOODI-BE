import type { CreateDishBody, UpdateDishBody } from '../types/dish.types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates POST /api/dishes body
 */
export function validateCreateDish(body: CreateDishBody): ValidationResult {
  const errors: string[] = [];

  if (!body.categoryId || typeof body.categoryId !== 'string') {
    errors.push('categoryId is required');
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('Dish name is required');
  }

  if (!body.description || typeof body.description !== 'string') {
    errors.push('Description is required');
  }

  if (body.price === undefined || body.price === null) {
    errors.push('Price is required');
  } else {
    const priceNum = Number(body.price);
    if (isNaN(priceNum) || priceNum < 0) {
      errors.push('Price must be a non-negative number');
    }
  }

  if (!body.unit || typeof body.unit !== 'string' || body.unit.trim().length === 0) {
    errors.push('Unit is required (e.g. "phần", "ly", "suất")');
  }

  for (const boolField of ['isVegetarian', 'isSpicy', 'isBestSeller', 'isActive', 'autoDisableByStock'] as const) {
    if (body[boolField] !== undefined && typeof body[boolField] !== 'boolean') {
      errors.push(`${boolField} must be a boolean`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates PUT /api/dishes/:id body
 */
export function validateUpdateDish(body: UpdateDishBody): ValidationResult {
  const errors: string[] = [];

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push('Dish name cannot be empty');
  }

  if (body.price !== undefined) {
    const priceNum = Number(body.price);
    if (isNaN(priceNum) || priceNum < 0) {
      errors.push('Price must be a non-negative number');
    }
  }

  if (body.unit !== undefined && (typeof body.unit !== 'string' || body.unit.trim().length === 0)) {
    errors.push('Unit cannot be empty');
  }

  for (const boolField of ['isVegetarian', 'isSpicy', 'isBestSeller', 'isActive', 'autoDisableByStock'] as const) {
    if (body[boolField] !== undefined && typeof body[boolField] !== 'boolean') {
      errors.push(`${boolField} must be a boolean`);
    }
  }

  return { valid: errors.length === 0, errors };
}
