import { postEnhancedRepository } from '../repositories/post-enhanced.repository';
import { postRepository } from '../repositories/post.repository';
import { mapPostCommunity } from '../dto/post-community.dto';
import { sanitizeContent } from '../utils/content.util';
import { validateImageUrls } from '../utils/image.util';
import { SocialServiceError, assertOwner } from '../middlewares/social.errors';
import { validateMentionsInContent } from './mention.service';
import { syncPostHashtags } from './hashtag-sync.service';
import { notify } from './notification.service';
import { parseContentMeta } from '../utils/content.util';
import type {
  CreatePostEnhancedBody,
  PostVisibility,
  UpdatePostEnhancedBody,
} from '../interfaces/community.types';
import { POST_VISIBILITY } from '../interfaces/community.types';

function assertVisibility(v?: string): PostVisibility {
  if (!v) return 'public';
  if (!POST_VISIBILITY.includes(v as PostVisibility)) {
    throw new SocialServiceError(`visibility must be one of: ${POST_VISIBILITY.join(', ')}`, 400);
  }
  return v as PostVisibility;
}

export async function canViewPost(
  post: { authorId: string; visibility: string },
  viewerId?: string
): Promise<boolean> {
  if (post.visibility === 'public') return true;
  if (!viewerId) return false;
  if (post.authorId === viewerId) return true;
  if (post.visibility === 'private') return false;
  if (post.visibility === 'followers') {
    const { followRepository } = await import('../repositories/follow.repository');
    const row = await followRepository.exists(viewerId, post.authorId);
    return !!row;
  }
  return false;
}

export async function createPostEnhanced(authorId: string, body: CreatePostEnhancedBody) {
  const content = sanitizeContent(body.content);
  const imageCheck = validateImageUrls(body.imageUrls);
  const visibility = assertVisibility(body.visibility);

  if (body.repostOfId) {
    const original = await postRepository.findById(body.repostOfId);
    if (!original) throw new SocialServiceError('Original post not found', 404);
  }

  await validateMentionsInContent(content);

  const post = await postEnhancedRepository.create(
    authorId,
    content,
    imageCheck.urls,
    visibility,
    body.repostOfId
  );

  await syncPostHashtags(post.id, content);

  const meta = parseContentMeta(content);
  for (const mention of meta.mentions) {
    const { prisma } = await import('../../../lib/prisma');
    const user = await prisma.user.findFirst({
      where: { userName: { equals: mention, mode: 'insensitive' } },
      select: { id: true },
    });
    if (user) {
      await notify({
        userId: user.id,
        actorId: authorId,
        type: 'MENTION',
        postId: post.id,
        message: 'mentioned you in a post',
      });
    }
  }

  if (body.repostOfId && body.repostOfId !== authorId) {
    const original = await postRepository.findById(body.repostOfId);
    if (original && original.authorId !== authorId) {
      await notify({
        userId: original.authorId,
        actorId: authorId,
        type: 'REPOST',
        postId: post.id,
        message: 'reposted your post',
      });
    }
  }

  return mapPostCommunity(post as Parameters<typeof mapPostCommunity>[0], authorId);
}

export async function updatePostEnhanced(
  postId: string,
  userId: string,
  body: UpdatePostEnhancedBody
) {
  const existing = await postEnhancedRepository.findByIdWithVisibility(postId);
  if (!existing) throw new SocialServiceError('Post not found', 404);
  assertOwner(existing.authorId, userId, 'post');

  const content =
    body.content !== undefined ? sanitizeContent(body.content) : existing.content;

  if (body.content !== undefined) {
    await validateMentionsInContent(content);
  }

  let imageUrls: string[] | undefined;
  if (body.imageUrls !== undefined) {
    imageUrls = validateImageUrls(body.imageUrls).urls;
  }

  const updated = await postRepository.update(postId, content, imageUrls);

  if (body.visibility !== undefined) {
    await postEnhancedRepository.updateVisibility(postId, assertVisibility(body.visibility));
  }

  if (body.content !== undefined) {
    await syncPostHashtags(postId, content);
  }

  const final = await postEnhancedRepository.findByIdWithVisibility(postId);
  return mapPostCommunity(final! as Parameters<typeof mapPostCommunity>[0], userId);
}
