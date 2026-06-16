import { prisma } from '../../../lib/prisma';
import { postInclude } from '../dto/post.dto';
import type { PostVisibility } from '../interfaces/community.types';

export const postEnhancedRepository = {
  create(
    authorId: string,
    content: string,
    imageUrls: string[],
    visibility: PostVisibility = 'public',
    repostOfId?: string
  ) {
    return prisma.$transaction(async (tx) => {
      return tx.socialPost.create({
        data: {
          authorId,
          content,
          visibility,
          repostOfId: repostOfId || null,
          images: {
            create: imageUrls.map((imageUrl) => ({ imageUrl })),
          },
        },
        include: postInclude,
      });
    });
  },

  updateVisibility(postId: string, visibility: PostVisibility) {
    return prisma.socialPost.update({
      where: { id: postId },
      data: { visibility },
      include: postInclude,
    });
  },

  findByIdWithVisibility(id: string) {
    return prisma.socialPost.findUnique({
      where: { id },
      include: postInclude,
    });
  },
};
