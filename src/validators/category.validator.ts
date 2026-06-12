import type { CreateCategoryBody, UpdateCategoryBody } from '../types/category.types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the request body for POST /api/categories (Create)
 */
export function validateCreateCategory(body: CreateCategoryBody): ValidationResult {
  const errors: string[] = [];

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('Category name is required and must be a non-empty string');
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('Description must be a string');
  }

  if (body.imageUrl !== undefined && body.imageUrl !== null && typeof body.imageUrl !== 'string') {
    errors.push('ImageUrl must be a string');
  }

  if (body.parentId !== undefined && body.parentId !== null && typeof body.parentId !== 'string') {
    errors.push('ParentId must be a string UUID');
  }

  if (body.displayOrder !== undefined) {
    if (typeof body.displayOrder !== 'number' || !Number.isInteger(body.displayOrder)) {
      errors.push('DisplayOrder must be an integer');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the request body for PUT /api/categories/:id (Update)
 */
export function validateUpdateCategory(body: UpdateCategoryBody): ValidationResult {
  const errors: string[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      errors.push('Category name cannot be empty');
    }
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('Description must be a string');
  }

  if (body.imageUrl !== undefined && body.imageUrl !== null && typeof body.imageUrl !== 'string') {
    errors.push('ImageUrl must be a string');
  }

  if (body.parentId !== undefined && body.parentId !== null && typeof body.parentId !== 'string') {
    errors.push('ParentId must be a string UUID');
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push('IsActive must be a boolean');
  }

  if (body.displayOrder !== undefined) {
    if (typeof body.displayOrder !== 'number' || !Number.isInteger(body.displayOrder)) {
      errors.push('DisplayOrder must be an integer');
    }
  }

  return { valid: errors.length === 0, errors };
}
