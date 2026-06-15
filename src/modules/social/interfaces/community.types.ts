import type { ListPostsQuery } from './social.types';

export const POST_VISIBILITY = ['public', 'followers', 'private'] as const;
export type PostVisibility = (typeof POST_VISIBILITY)[number];

export const NOTIFICATION_TYPES = [
  'LIKE',
  'COMMENT',
  'FOLLOW',
  'MENTION',
  'REPOST',
  'SHARE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type FeedType = 'latest' | 'trending' | 'following' | 'profile';

export interface CreatePostEnhancedBody {
  content: string;
  imageUrls?: string[];
  visibility?: PostVisibility;
  repostOfId?: string;
}

export interface UpdatePostEnhancedBody {
  content?: string;
  imageUrls?: string[];
  visibility?: PostVisibility;
}

export interface ListFeedQuery extends ListPostsQuery {
  feed?: FeedType;
  userId?: string;
}

export interface FollowUserBody {
  userId: string;
}

export interface UpdateSocialProfileBody {
  bio?: string;
  coverImageUrl?: string;
  avatarUrl?: string;
  fullName?: string;
}

export interface SearchQuery {
  q: string;
  limit?: string;
  cursor?: string;
  type?: 'all' | 'users' | 'posts' | 'hashtags';
}

export interface ListNotificationsQuery {
  limit?: string;
  cursor?: string;
  unreadOnly?: string;
}

export interface CreateNotificationPayload {
  userId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
  commentId?: string;
  message?: string;
}
