import { prisma } from '../../../lib/prisma';

const profileSelect = {
  id: true,
  userName: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  bio: true,
  coverImageUrl: true,
  createdAt: true,
} as const;

export const profileRepository = {
  findById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
  },

  update(userId: string, data: { bio?: string; coverImageUrl?: string; avatarUrl?: string; fullName?: string }) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });
  },

  searchUsers(query: string, limit: number) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { userName: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: profileSelect,
    });
  },
};
