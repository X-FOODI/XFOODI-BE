import { prisma } from '../../../lib/prisma';

export const hashtagRepository = {
  upsertTags(tags: string[]) {
    return Promise.all(
      tags.map((tag) =>
        prisma.socialHashtag.upsert({
          where: { tag },
          create: { tag, postCount: 0 },
          update: {},
        })
      )
    );
  },

  linkPostToHashtags(postId: string, hashtagIds: string[]) {
    if (hashtagIds.length === 0) return Promise.resolve();
    return prisma.socialPostHashtag.createMany({
      data: hashtagIds.map((hashtagId) => ({ postId, hashtagId })),
      skipDuplicates: true,
    });
  },

  unlinkPost(postId: string) {
    return prisma.socialPostHashtag.deleteMany({ where: { postId } });
  },

  incrementCounts(hashtagIds: string[], delta: number) {
    return Promise.all(
      hashtagIds.map((id) =>
        prisma.socialHashtag.update({
          where: { id },
          data: { postCount: { increment: delta } },
        })
      )
    );
  },

  findTrending(limit: number) {
    return prisma.socialHashtag.findMany({
      orderBy: [{ postCount: 'desc' }, { tag: 'asc' }],
      take: limit,
    });
  },

  findByTag(tag: string) {
    return prisma.socialHashtag.findUnique({ where: { tag } });
  },

  searchTags(query: string, limit: number) {
    return prisma.socialHashtag.findMany({
      where: { tag: { contains: query, mode: 'insensitive' } },
      orderBy: { postCount: 'desc' },
      take: limit,
    });
  },

  getPostIdsByTag(tag: string, limit: number) {
    return prisma.socialPostHashtag.findMany({
      where: { hashtag: { tag } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { postId: true },
    });
  },
};
