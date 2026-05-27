import { prisma } from '../../../lib/prisma';
import { postInclude } from '../dto/post.dto';
import type { CursorPayload } from '../utils/pagination.util';
import type { PostVisibility } from '../interfaces/community.types';

function cursorWhere(cursor: CursorPayload | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      {
        createdAt: new Date(cursor.createdAt),
        id: { lt: cursor.id },
      },
    ],
  };
}

function visibilityFilter(viewerId: string | undefined, authorIds?: string[]) {
  if (!viewerId) {
    return { visibility: 'public' as PostVisibility };
  }
  return {
    OR: [
      { visibility: 'public' },
      { authorId: viewerId },
      ...(authorIds?.length
        ? [{ visibility: 'followers', authorId: { in: authorIds } }]
        : []),
    ],
  };
}

export const feedRepository = {
  findLatest(limit: number, cursor: CursorPayload | null, viewerId?: string) {
    return prisma.socialPost.findMany({
      where: {
        ...visibilityFilter(viewerId),
        ...cursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },

  findFollowing(
    limit: number,
    cursor: CursorPayload | null,
    viewerId: string,
    followingIds: string[]
  ) {
    const ids = [...new Set([viewerId, ...followingIds])];
    if (ids.length === 0) return Promise.resolve([]);

    return prisma.socialPost.findMany({
      where: {
        authorId: { in: ids },
        ...visibilityFilter(viewerId, followingIds),
        ...cursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },

  findTrending(limit: number, cursor: CursorPayload | null, viewerId?: string) {
    return prisma.socialPost.findMany({
      where: {
        ...visibilityFilter(viewerId),
        ...cursorWhere(cursor),
      },
      orderBy: [{ reactions: { _count: 'desc' } }, { createdAt: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },

  findByAuthor(
    authorId: string,
    limit: number,
    cursor: CursorPayload | null,
    viewerId?: string
  ) {
    return prisma.socialPost.findMany({
      where: {
        authorId,
        ...visibilityFilter(viewerId, viewerId ? [authorId] : undefined),
        ...cursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },

  findByIds(postIds: string[], limit: number, cursor: CursorPayload | null, viewerId?: string) {
    if (postIds.length === 0) return Promise.resolve([]);
    return prisma.socialPost.findMany({
      where: {
        id: { in: postIds },
        ...visibilityFilter(viewerId),
        ...cursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },

  searchPosts(query: string, limit: number) {
    return prisma.socialPost.findMany({
      where: {
        visibility: 'public',
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: postInclude,
    });
  },
};
