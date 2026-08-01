import { centralPrisma as prisma } from '../../../lib/prisma';

export const savedPostRepository = {
  findByPostAndUser(postId: string, userId: string) {
    return prisma.savedPost.findUnique({
      where: { postId_userId: { postId, userId } },
    });
  },

  create(postId: string, userId: string) {
    return prisma.savedPost.create({
      data: { postId, userId },
    });
  },

  remove(postId: string, userId: string) {
    return prisma.savedPost.delete({
      where: { postId_userId: { postId, userId } },
    });
  },
};
