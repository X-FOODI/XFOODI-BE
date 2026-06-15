import { shareRepository } from '../repositories/share.repository';
import { postRepository } from '../repositories/post.repository';
import { SocialServiceError } from '../middlewares/social.errors';

export async function sharePost(postId: string, userId: string) {
  const post = await postRepository.findById(postId);
  if (!post) {
    throw new SocialServiceError('Post not found', 404);
  }

  const share = await shareRepository.create(postId, userId);
  return {
    id: share.id,
    postId: share.postId,
    createdAt: share.createdAt,
  };
}
