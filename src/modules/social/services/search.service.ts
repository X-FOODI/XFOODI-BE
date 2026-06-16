import { profileRepository } from '../repositories/profile.repository';
import { feedRepository } from '../repositories/feed.repository';
import { hashtagRepository } from '../repositories/hashtag.repository';
import { mapPost } from '../dto/post.dto';
import { parseLimit } from '../utils/pagination.util';
import type { SearchQuery } from '../interfaces/community.types';

export async function searchAll(query: SearchQuery, viewerId?: string) {
  const q = query.q?.trim();
  if (!q || q.length < 2) {
    return { users: [], posts: [], hashtags: [] };
  }

  const limit = Math.min(parseLimit(query.limit), 30);
  const type = query.type ?? 'all';

  const result: {
    users: Awaited<ReturnType<typeof profileRepository.searchUsers>>;
    posts: ReturnType<typeof mapPost>[];
    hashtags: Awaited<ReturnType<typeof hashtagRepository.searchTags>>;
  } = { users: [], posts: [], hashtags: [] };

  if (type === 'all' || type === 'users') {
    result.users = await profileRepository.searchUsers(q, limit);
  }
  if (type === 'all' || type === 'posts') {
    const posts = await feedRepository.searchPosts(q, limit);
    result.posts = posts.map((p) => mapPost(p, viewerId));
  }
  if (type === 'all' || type === 'hashtags') {
    result.hashtags = await hashtagRepository.searchTags(q.replace(/^#/, ''), limit);
  }

  return result;
}
