import { postRepository } from '../repositories/post.repository';
import { mapPost, mapPostList } from '../dto/post.dto';
import { sanitizeContent, contentMatchesHashtag } from '../utils/content.util';
import { validateImageUrls } from '../utils/image.util';
import { decodeCursor, parseLimit } from '../utils/pagination.util';
import { SocialServiceError, assertOwner } from '../middlewares/social.errors';
import { validateMentionsInContent } from './mention.service';
import type { CreatePostBody, UpdatePostBody, ListPostsQuery } from '../interfaces/social.types';

async function ensurePostExists(postId: string) {
  const post = await postRepository.findById(postId);
  if (!post) {
    throw new SocialServiceError('Post not found', 404);
  }
  return post;
}

export async function createPost(authorId: string, body: CreatePostBody) {
  const content = sanitizeContent(body.content);
  const imageCheck = validateImageUrls(body.imageUrls);
  const imageUrls = imageCheck.urls;

  await validateMentionsInContent(content);

  const post = await postRepository.create(authorId, content, imageUrls);
  return mapPost(post, authorId);
}

export async function listPosts(query: ListPostsQuery, viewerId?: string) {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.cursor);
  const hashtag = query.hashtag?.replace(/^#/, '').toLowerCase();

  let rows = await postRepository.findMany({
    limit,
    cursor,
    authorId: query.authorId,
    hashtag,
  });

  if (hashtag) {
    rows = rows.filter((p) => contentMatchesHashtag(p.content, hashtag));
  }

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return mapPostList(items, viewerId, hasMore);
}

export async function getPostById(postId: string, viewerId?: string) {
  const post = await ensurePostExists(postId);
  return mapPost(post, viewerId);
}

export async function updatePost(postId: string, userId: string, body: UpdatePostBody) {
  const existing = await ensurePostExists(postId);
  assertOwner(existing.authorId, userId, 'post');

  const content =
    body.content !== undefined ? sanitizeContent(body.content) : existing.content;

  if (body.content !== undefined) {
    await validateMentionsInContent(content);
  }

  let imageUrls: string[] | undefined;
  if (body.imageUrls !== undefined) {
    const imageCheck = validateImageUrls(body.imageUrls);
    imageUrls = imageCheck.urls;
  }

  const updated = await postRepository.update(postId, content, imageUrls);
  return mapPost(updated, userId);
}

export async function deletePost(postId: string, userId: string) {
  const existing = await ensurePostExists(postId);
  assertOwner(existing.authorId, userId, 'post');
  await postRepository.delete(postId);
}

export async function listSavedPosts(query: ListPostsQuery, userId: string) {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.cursor);

  const rows = await postRepository.findSavedByUser(userId, limit, cursor);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return mapPostList(items, userId, hasMore);
}
