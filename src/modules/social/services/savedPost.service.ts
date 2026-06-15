import { savedPostRepository } from '../repositories/savedPost.repository';
import { postRepository } from '../repositories/post.repository';
import { SocialServiceError } from '../middlewares/social.errors';

export async function toggleSavePost(postId: string, userId: string) {
  const post = await postRepository.findById(postId);
  if (!post) {
    throw new SocialServiceError('Post not found', 404);
  }

  const existing = await savedPostRepository.findByPostAndUser(postId, userId);

  if (existing) {
    await savedPostRepository.remove(postId, userId);
    return { saved: false };
  }

  await savedPostRepository.create(postId, userId);
  return { saved: true };
}
