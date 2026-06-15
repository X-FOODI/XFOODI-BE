import { commentRepository } from '../repositories/comment.repository';
import { postRepository } from '../repositories/post.repository';
import { mapComment } from '../dto/comment.dto';
import { sanitizeContent } from '../utils/content.util';
import { SocialServiceError, assertOwner } from '../middlewares/social.errors';
import { validateMentionsInContent } from './mention.service';
import { decodeCursor, encodeCursor, parseLimit } from '../utils/pagination.util';
import type { CreateCommentBody, UpdateCommentBody, ListPostsQuery } from '../interfaces/social.types';

export async function createComment(userId: string, body: CreateCommentBody) {
  const post = await postRepository.findById(body.postId);
  if (!post) {
    throw new SocialServiceError('Post not found', 404);
  }

  if (body.parentId) {
    const parent = await commentRepository.findParentInPost(body.parentId, body.postId);
    if (!parent) {
      throw new SocialServiceError('Parent comment not found on this post', 404);
    }
    if (parent.parentId) {
      throw new SocialServiceError('Nested replies are limited to one level', 400);
    }
  }

  const content = sanitizeContent(body.content);
  await validateMentionsInContent(content);

  const comment = await commentRepository.create(body.postId, userId, content, body.parentId);
  return mapComment(comment);
}

export async function updateComment(commentId: string, userId: string, body: UpdateCommentBody) {
  const existing = await commentRepository.findById(commentId);
  if (!existing) {
    throw new SocialServiceError('Comment not found', 404);
  }

  assertOwner(existing.userId, userId, 'comment');

  const content = sanitizeContent(body.content);
  await validateMentionsInContent(content);

  const updated = await commentRepository.update(commentId, content);
  return mapComment(updated);
}

export async function listCommentsForPost(postId: string, query: Pick<ListPostsQuery, 'cursor' | 'limit'>) {
  const post = await postRepository.findById(postId);
  if (!post) {
    throw new SocialServiceError('Post not found', 404);
  }

  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.cursor);
  const rows = await commentRepository.findTopLevelByPost(postId, limit, cursor);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

  return {
    items: items.map((c) => mapComment(c)),
    pagination: { nextCursor, hasMore },
  };
}

export async function deleteComment(commentId: string, userId: string) {
  const existing = await commentRepository.findById(commentId);
  if (!existing) {
    throw new SocialServiceError('Comment not found', 404);
  }

  assertOwner(existing.userId, userId, 'comment');
  await commentRepository.delete(commentId);
}
