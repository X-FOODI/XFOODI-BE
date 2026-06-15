import { prisma } from '../../../lib/prisma';

export const shareRepository = {
  create(postId: string, userId: string) {
    return prisma.socialShare.create({
      data: { postId, userId },
    });
  },
};
