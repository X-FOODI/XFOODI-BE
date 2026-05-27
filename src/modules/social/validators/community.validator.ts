import type { ValidationResult } from '../interfaces/social.types';
import { POST_VISIBILITY } from '../interfaces/community.types';
import type {
  CreatePostEnhancedBody,
  UpdatePostEnhancedBody,
  UpdateSocialProfileBody,
  SearchQuery,
} from '../interfaces/community.types';
import { validateCreatePost, validateUpdatePost } from './post.validator';
import { decodeCursor } from '../utils/pagination.util';

export function validateCreatePostEnhanced(body: CreatePostEnhancedBody): ValidationResult {
  const base = validateCreatePost(body);
  if (!base.valid) return base;

  const errors: string[] = [];
  if (body.visibility && !POST_VISIBILITY.includes(body.visibility)) {
    errors.push(`visibility must be one of: ${POST_VISIBILITY.join(', ')}`);
  }
  return { valid: errors.length === 0, errors: [...base.errors, ...errors] };
}

export function validateUpdatePostEnhanced(body: UpdatePostEnhancedBody): ValidationResult {
  const base = validateUpdatePost(body);
  if (!base.valid) return base;

  const errors: string[] = [];
  if (body.visibility && !POST_VISIBILITY.includes(body.visibility)) {
    errors.push(`visibility must be one of: ${POST_VISIBILITY.join(', ')}`);
  }
  return { valid: errors.length === 0, errors: [...base.errors, ...errors] };
}

export function validateUpdateProfile(body: UpdateSocialProfileBody): ValidationResult {
  const errors: string[] = [];
  if (
    body.bio === undefined &&
    body.coverImageUrl === undefined &&
    body.avatarUrl === undefined &&
    body.fullName === undefined
  ) {
    errors.push('At least one profile field is required');
  }
  if (body.bio !== undefined && body.bio.length > 500) {
    errors.push('bio must not exceed 500 characters');
  }
  return { valid: errors.length === 0, errors };
}

export function validateSearchQuery(query: SearchQuery): ValidationResult {
  const errors: string[] = [];
  if (!query.q || query.q.trim().length < 2) {
    errors.push('q must be at least 2 characters');
  }
  if (query.cursor && !decodeCursor(query.cursor)) {
    errors.push('Invalid pagination cursor');
  }
  return { valid: errors.length === 0, errors };
}

export function validateFollowTarget(userId: unknown): ValidationResult {
  if (!userId || typeof userId !== 'string') {
    return { valid: false, errors: ['userId is required'] };
  }
  return { valid: true, errors: [] };
}
