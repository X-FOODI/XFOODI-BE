import { prisma } from '../../../lib/prisma';
import { commentInclude } from '../dto/comment.dto';

export const commentRepository = {
  create(postId: string, userId: string, content: string, parentId?: string) {
    return prisma.socialComment.create({
      data: {
        postId,
        userId,
        content,
        ...(parentId ? { parentId } : {}),
      },
      include: commentInclude,
    });
  },

  findById(id: string) {
    return prisma.socialComment.findUnique({
      where: { id },
      include: { user: true },
    });
  },

  findParentInPost(parentId: string, postId: string) {
    return prisma.socialComment.findFirst({
      where: { id: parentId, postId },
    });
  },

  update(id: string, content: string) {
    return prisma.socialComment.update({
      where: { id },
      data: { content },
      include: commentInclude,
    });
  },

  delete(id: string) {
    return prisma.socialComment.delete({ where: { id } });
  },

  findTopLevelByPost(postId: string, limit: number, cursor: { createdAt: string; id: string } | null) {
    return prisma.socialComment.findMany({
      where: {
        postId,
        parentId: null,
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
      include: commentInclude,
    });
  },
};
