import * as reactionService from './reaction.service';
import { postRepository } from '../repositories/post.repository';
import { notify } from './notification.service';
import type { CreateReactionBody } from '../interfaces/social.types';

export async function toggleReactionWithNotification(userId: string, body: CreateReactionBody) {
  const result = await reactionService.toggleReaction(userId, body);

  if (result.action === 'added' || result.action === 'updated') {
    const post = await postRepository.findById(body.postId);
    if (post && post.authorId !== userId) {
      await notify({
        userId: post.authorId,
        actorId: userId,
        type: 'LIKE',
        postId: body.postId,
        message: `reacted with ${body.type}`,
      });
    }
  }

  return result;
}
