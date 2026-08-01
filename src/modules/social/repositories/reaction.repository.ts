import { centralPrisma as prisma } from '../../../lib/prisma';
import type { ReactionType } from '../interfaces/social.types';

export const reactionRepository = {
  findByPostAndUser(postId: string, userId: string) {
    return prisma.socialReaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });
  },

  upsert(postId: string, userId: string, type: ReactionType) {
    return prisma.socialReaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, type },
      update: { type },
    });
  },

  remove(postId: string, userId: string) {
    return prisma.socialReaction.delete({
      where: { postId_userId: { postId, userId } },
    });
  },
};
