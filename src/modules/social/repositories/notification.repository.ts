import { prisma } from '../../../lib/prisma';
import type { CreateNotificationPayload } from '../interfaces/community.types';
import type { CursorPayload } from '../utils/pagination.util';

export const notificationRepository = {
  create(data: CreateNotificationPayload) {
    return prisma.socialNotification.create({
      data: {
        userId: data.userId,
        actorId: data.actorId,
        type: data.type,
        postId: data.postId,
        commentId: data.commentId,
        message: data.message,
      },
      include: {
        actor: { select: { id: true, fullName: true, userName: true, avatarUrl: true } },
      },
    });
  },

  listForUser(userId: string, limit: number, cursor: CursorPayload | null, unreadOnly: boolean) {
    return prisma.socialNotification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
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
      include: {
        actor: { select: { id: true, fullName: true, userName: true, avatarUrl: true } },
      },
    });
  },

  markRead(userId: string, notificationIds?: string[]) {
    return prisma.socialNotification.updateMany({
      where: {
        userId,
        ...(notificationIds?.length ? { id: { in: notificationIds } } : {}),
        read: false,
      },
      data: { read: true },
    });
  },

  countUnread(userId: string) {
    return prisma.socialNotification.count({
      where: { userId, read: false },
    });
  },
};
