import { centralPrisma as prisma, centralPrisma } from '../../../lib/prisma';
import { postInclude } from '../dto/post.dto';
import type { CursorPayload } from '../utils/pagination.util';

export const postRepository = {
  create(authorId: string, content: string, imageUrls: string[]) {
    return centralPrisma.$transaction(async (tx) => {
      const post = await tx.socialPost.create({
        data: {
          authorId,
          content,
          images: {
            create: imageUrls.map((imageUrl) => ({ imageUrl })),
          },
        },
        include: postInclude,
      });
      return post;
    });
  },

  findById(id: string) {
    return prisma.socialPost.findUnique({
      where: { id },
      include: postInclude,
    });
  },

  findMany(params: {
    limit: number;
    cursor: CursorPayload | null;
    authorId?: string;
    hashtag?: string;
  }) {
    const { limit, cursor, authorId } = params;

    return prisma.socialPost.findMany({
      where: {
        ...(authorId ? { authorId } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },

  update(id: string, content: string, imageUrls?: string[]) {
    return centralPrisma.$transaction(async (tx) => {
      if (imageUrls !== undefined) {
        await tx.socialImage.deleteMany({ where: { postId: id } });
        if (imageUrls.length > 0) {
          await tx.socialImage.createMany({
            data: imageUrls.map((imageUrl) => ({ postId: id, imageUrl })),
          });
        }
      }

      return tx.socialPost.update({
        where: { id },
        data: { content },
        include: postInclude,
      });
    });
  },

  delete(id: string) {
    return prisma.socialPost.delete({ where: { id } });
  },

  findSavedByUser(userId: string, limit: number, cursor: CursorPayload | null) {
    return prisma.socialPost.findMany({
      where: {
        savedBy: { some: { userId } },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
  },
};
