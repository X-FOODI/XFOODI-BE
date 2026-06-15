import { REACTION_TYPES, type CreateReactionBody, type ValidationResult } from '../interfaces/social.types';

export function validateCreateReaction(body: CreateReactionBody): ValidationResult {
  const errors: string[] = [];

  if (!body.postId || typeof body.postId !== 'string') {
    errors.push('postId is required');
  }

  if (!body.type || typeof body.type !== 'string') {
    errors.push('type is required');
  } else if (!REACTION_TYPES.includes(body.type as (typeof REACTION_TYPES)[number])) {
    errors.push(`type must be one of: ${REACTION_TYPES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
