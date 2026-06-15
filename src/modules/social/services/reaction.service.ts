import { reactionRepository } from '../repositories/reaction.repository';
import { postRepository } from '../repositories/post.repository';
import { SocialServiceError } from '../middlewares/social.errors';
import type { CreateReactionBody, ReactionType } from '../interfaces/social.types';

export async function toggleReaction(userId: string, body: CreateReactionBody) {
  const post = await postRepository.findById(body.postId);
  if (!post) {
    throw new SocialServiceError('Post not found', 404);
  }

  const existing = await reactionRepository.findByPostAndUser(body.postId, userId);
  const type = body.type as ReactionType;

  if (existing?.type === type) {
    await reactionRepository.remove(body.postId, userId);
    return { action: 'removed' as const, type: null };
  }

  await reactionRepository.upsert(body.postId, userId, type);
  return { action: existing ? 'updated' as const : 'added' as const, type };
}
