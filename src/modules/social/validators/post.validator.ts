import type {
  CreatePostBody,
  UpdatePostBody,
  ListPostsQuery,
  ValidationResult,
} from '../interfaces/social.types';
import { validateImageUrls } from '../utils/image.util';
import { coerceQueryString, decodeCursor } from '../utils/pagination.util';

const MAX_CONTENT_LENGTH = 10000;

export function validateCreatePost(body: CreatePostBody): ValidationResult {
  const errors: string[] = [];

  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    errors.push('content is required and cannot be empty');
  } else if (body.content.trim().length > MAX_CONTENT_LENGTH) {
    errors.push(`content must not exceed ${MAX_CONTENT_LENGTH} characters`);
  }

  const imageCheck = validateImageUrls(body.imageUrls);
  if (!imageCheck.valid) {
    errors.push(...imageCheck.errors);
  }

  return { valid: errors.length === 0, errors };
}

export function validateUpdatePost(body: UpdatePostBody): ValidationResult {
  const errors: string[] = [];

  if (body.content === undefined && body.imageUrls === undefined) {
    errors.push('At least one of content or imageUrls must be provided');
  }

  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || !body.content.trim()) {
      errors.push('content cannot be empty');
    } else if (body.content.trim().length > MAX_CONTENT_LENGTH) {
      errors.push(`content must not exceed ${MAX_CONTENT_LENGTH} characters`);
    }
  }

  if (body.imageUrls !== undefined) {
    const imageCheck = validateImageUrls(body.imageUrls);
    if (!imageCheck.valid) {
      errors.push(...imageCheck.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeListPostsQuery(query: Record<string, unknown>): ListPostsQuery {
  return {
    cursor: coerceQueryString(query.cursor as string | string[] | undefined),
    limit: coerceQueryString(query.limit as string | string[] | undefined),
    hashtag: coerceQueryString(query.hashtag as string | string[] | undefined),
    authorId: coerceQueryString(query.authorId as string | string[] | undefined),
  };
}

export function validateListPosts(query: ListPostsQuery): ValidationResult {
  const errors: string[] = [];

  if (query.cursor && !decodeCursor(query.cursor)) {
    errors.push('Invalid pagination cursor');
  }

  return { valid: errors.length === 0, errors };
}
