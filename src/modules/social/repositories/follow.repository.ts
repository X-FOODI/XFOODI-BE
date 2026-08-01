import { centralPrisma as prisma } from '../../../lib/prisma';

export const followRepository = {
  follow(followerId: string, followingId: string) {
    return prisma.socialFollow.create({
      data: { followerId, followingId },
    });
  },

  unfollow(followerId: string, followingId: string) {
    return prisma.socialFollow.deleteMany({
      where: { followerId, followingId },
    });
  },

  exists(followerId: string, followingId: string) {
    return prisma.socialFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
  },

  countFollowers(userId: string) {
    return prisma.socialFollow.count({ where: { followingId: userId } });
  },

  countFollowing(userId: string) {
    return prisma.socialFollow.count({ where: { followerId: userId } });
  },

  listFollowers(userId: string, limit: number, skip: number) {
    return prisma.socialFollow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
      include: {
        follower: {
          select: { id: true, fullName: true, userName: true, avatarUrl: true, bio: true },
        },
      },
    });
  },

  listFollowing(userId: string, limit: number, skip: number) {
    return prisma.socialFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
      include: {
        following: {
          select: { id: true, fullName: true, userName: true, avatarUrl: true, bio: true },
        },
      },
    });
  },

  getFollowingIds(followerId: string) {
    return prisma.socialFollow.findMany({
      where: { followerId },
      select: { followingId: true },
    });
  },
};
