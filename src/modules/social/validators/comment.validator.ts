import type { CreateCommentBody, UpdateCommentBody, ValidationResult } from '../interfaces/social.types';

const MAX_CONTENT_LENGTH = 5000;

export function validateCreateComment(body: CreateCommentBody): ValidationResult {
  const errors: string[] = [];

  if (!body.postId || typeof body.postId !== 'string') {
    errors.push('postId is required');
  }

  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    errors.push('content is required and cannot be empty');
  } else if (body.content.trim().length > MAX_CONTENT_LENGTH) {
    errors.push(`content must not exceed ${MAX_CONTENT_LENGTH} characters`);
  }

  if (body.parentId !== undefined && typeof body.parentId !== 'string') {
    errors.push('parentId must be a string');
  }

  return { valid: errors.length === 0, errors };
}

export function validateUpdateComment(body: UpdateCommentBody): ValidationResult {
  const errors: string[] = [];

  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    errors.push('content is required and cannot be empty');
  } else if (body.content.trim().length > MAX_CONTENT_LENGTH) {
    errors.push(`content must not exceed ${MAX_CONTENT_LENGTH} characters`);
  }

  return { valid: errors.length === 0, errors };
}
