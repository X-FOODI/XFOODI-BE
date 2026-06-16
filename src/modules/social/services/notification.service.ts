import { notificationRepository } from '../repositories/notification.repository';
import { encodeCursor, decodeCursor, parseLimit } from '../utils/pagination.util';
import { SocialServiceError } from '../middlewares/social.errors';
import type {
  CreateNotificationPayload,
  ListNotificationsQuery,
} from '../interfaces/community.types';
import { emitSocialNotification } from '../realtime/social-socket';
import { mapNotificationRealtimePayload } from '../realtime/social-realtime.mapper';

export async function notify(payload: CreateNotificationPayload) {
  if (payload.userId === payload.actorId) return null;
  try {
    const row = await notificationRepository.create(payload);
    emitSocialNotification(payload.userId, mapNotificationRealtimePayload(row));
    return row;
  } catch (err) {
    console.error('[Social] notification create failed:', (err as Error).message);
    return null;
  }
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.cursor);
  const unreadOnly = query.unreadOnly === 'true' || query.unreadOnly === '1';

  const rows = await notificationRepository.listForUser(userId, limit, cursor, unreadOnly);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

  return {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      postId: n.postId,
      commentId: n.commentId,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
      actor: n.actor,
    })),
    pagination: { nextCursor, hasMore },
    unreadCount: await notificationRepository.countUnread(userId),
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await notificationRepository.markRead(userId, ids);
  return { unreadCount: await notificationRepository.countUnread(userId) };
}

export async function getUnreadCount(userId: string) {
  return { unreadCount: await notificationRepository.countUnread(userId) };
}

export function assertNotificationOwner(notificationUserId: string, userId: string) {
  if (notificationUserId !== userId) {
    throw new SocialServiceError('Forbidden', 403);
  }
}
