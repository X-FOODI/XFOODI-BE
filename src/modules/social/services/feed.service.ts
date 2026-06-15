import redisClient from '../../../lib/redis';
import { feedRepository } from '../repositories/feed.repository';
import { followRepository } from '../repositories/follow.repository';
import { hashtagRepository } from '../repositories/hashtag.repository';
import { mapPostList } from '../dto/post.dto';
import { decodeCursor, parseLimit } from '../utils/pagination.util';
import { EMPTY_POST_LIST, isSocialSchemaUnavailable } from '../middlewares/social.errors';
import type { FeedType, ListFeedQuery } from '../interfaces/community.types';

const TRENDING_CACHE_KEY = 'social:trending:hashtags';
const TRENDING_CACHE_TTL = 300;

async function getFollowingIds(viewerId: string): Promise<string[]> {
  const rows = await followRepository.getFollowingIds(viewerId);
  return rows.map((r) => r.followingId);
}

export async function getFeed(feed: FeedType, query: ListFeedQuery, viewerId?: string) {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.cursor);

  try {
    let rows;
    switch (feed) {
      case 'following': {
        if (!viewerId) return { ...EMPTY_POST_LIST };
        const followingIds = await getFollowingIds(viewerId);
        rows = await feedRepository.findFollowing(limit, cursor, viewerId, followingIds);
        break;
      }
      case 'trending':
        rows = await feedRepository.findTrending(limit, cursor, viewerId);
        break;
      case 'profile': {
        const authorId = query.userId || query.authorId;
        if (!authorId) return { ...EMPTY_POST_LIST };
        rows = await feedRepository.findByAuthor(authorId, limit, cursor, viewerId);
        break;
      }
      case 'latest':
      default:
        rows = await feedRepository.findLatest(limit, cursor, viewerId);
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return mapPostList(items, viewerId, hasMore);
  } catch (err) {
    if (isSocialSchemaUnavailable(err)) {
      return { ...EMPTY_POST_LIST };
    }
    throw err;
  }
}

export async function getTrendingHashtags(limit = 20) {
  try {
    const cached = await redisClient.get(TRENDING_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { tag: string; postCount: number }[];
      return { items: parsed.slice(0, limit) };
    }
  } catch {
    /* cache miss */
  }

  const rows = await hashtagRepository.findTrending(limit);
  const items = rows.map((h) => ({ tag: h.tag, postCount: h.postCount }));

  try {
    await redisClient.setEx(TRENDING_CACHE_KEY, TRENDING_CACHE_TTL, JSON.stringify(items));
  } catch {
    /* ignore */
  }

  return { items };
}

export async function getHashtagFeed(tag: string, query: ListFeedQuery, viewerId?: string) {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.cursor);
  const normalized = tag.replace(/^#/, '').toLowerCase();
  const links = await hashtagRepository.getPostIdsByTag(normalized, limit * 3);
  const postIds = links.map((l) => l.postId);
  const rows = await feedRepository.findByIds(postIds, limit, cursor, viewerId);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return mapPostList(items, viewerId, hasMore);
}
