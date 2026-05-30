import type { RequestHandler } from 'express';
import { SocialServiceError } from '../middlewares/social.errors';
import * as followService from '../services/follow.service';
import * as feedService from '../services/feed.service';
import * as searchService from '../services/search.service';
import * as notificationService from '../services/notification.service';
import * as profileService from '../services/profile.service';
import * as postEnhancedService from '../services/post-enhanced.service';
import * as mediaService from '../services/media.service';
import * as reactionEnhancedService from '../services/reaction-enhanced.service';
import * as commentEnhancedService from '../services/comment-enhanced.service';
import { normalizeListPostsQuery } from '../validators/post.validator';
import {
  validateCreatePostEnhanced,
  validateUpdatePostEnhanced,
  validateUpdateProfile,
  validateSearchQuery,
  validateFollowTarget,
} from '../validators/community.validator';
import { validateCreateReaction } from '../validators/reaction.validator';
import { validateCreateComment } from '../validators/comment.validator';
import type {
  CreatePostEnhancedBody,
  UpdatePostEnhancedBody,
  ListFeedQuery,
  UpdateSocialProfileBody,
  SearchQuery,
  ListNotificationsQuery,
  FeedType,
} from '../interfaces/community.types';
import type { CreateReactionBody, CreateCommentBody } from '../interfaces/social.types';

function getUserId(req: any): string {
  return req.user?.sub as string;
}

function handleError(res: any, err: unknown): void {
  if (err instanceof SocialServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }
  const error = err as Error;
  console.error('[CommunityController]', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

// ─── Enhanced posts ───────────────────────────────────────────────────────────

export const createPostEnhanced: RequestHandler = async (req, res) => {
  try {
    const body = req.body as CreatePostEnhancedBody;
    const { valid, errors } = validateCreatePostEnhanced(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const data = await postEnhancedService.createPostEnhanced(getUserId(req), body);
    res.status(201).json({ success: true, message: 'Post created successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};

export const updatePostEnhanced: RequestHandler = async (req, res) => {
  try {
    const body = req.body as UpdatePostEnhancedBody;
    const { valid, errors } = validateUpdatePostEnhanced(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const data = await postEnhancedService.updatePostEnhanced(
      String(req.params.id),
      getUserId(req),
      body
    );
    res.json({ success: true, message: 'Post updated successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Feeds ────────────────────────────────────────────────────────────────────

export const getFeed: RequestHandler = async (req: any, res) => {
  try {
    const feed = (req.params.feed || 'latest') as FeedType;
    const query = normalizeListPostsQuery(req.query as Record<string, unknown>) as ListFeedQuery;
    query.userId = typeof req.query.userId === 'string' ? req.query.userId : query.authorId;

    const viewerId = req.user?.sub as string | undefined;
    const data = await feedService.getFeed(feed, query, viewerId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const getTrendingHashtags: RequestHandler = async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const data = await feedService.getTrendingHashtags(limit);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const getHashtagPage: RequestHandler = async (req: any, res) => {
  try {
    const query = normalizeListPostsQuery(req.query as Record<string, unknown>) as ListFeedQuery;
    const viewerId = req.user?.sub as string | undefined;
    const data = await feedService.getHashtagFeed(String(req.params.tag), query, viewerId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Follows ──────────────────────────────────────────────────────────────────

export const followUser: RequestHandler = async (req, res) => {
  try {
    const targetId = String(req.params.userId);
    const { valid, errors } = validateFollowTarget(targetId);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const data = await followService.followUser(getUserId(req), targetId);
    res.json({ success: true, message: 'Followed successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};

export const unfollowUser: RequestHandler = async (req, res) => {
  try {
    const data = await followService.unfollowUser(getUserId(req), String(req.params.userId));
    res.json({ success: true, message: 'Unfollowed successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};

export const getFollowStats: RequestHandler = async (req, res) => {
  try {
    const data = await followService.getFollowStats(String(req.params.userId));
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const listFollowers: RequestHandler = async (req, res) => {
  try {
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const data = await followService.listFollowers(String(req.params.userId), page, limit);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const listFollowing: RequestHandler = async (req, res) => {
  try {
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const data = await followService.listFollowing(String(req.params.userId), page, limit);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const listNotifications: RequestHandler = async (req, res) => {
  try {
    const query = req.query as ListNotificationsQuery;
    const data = await notificationService.listNotifications(getUserId(req), query);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const markNotificationsRead: RequestHandler = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : undefined;
    const data = await notificationService.markNotificationsRead(getUserId(req), ids);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const getUnreadNotificationCount: RequestHandler = async (req, res) => {
  try {
    const data = await notificationService.getUnreadCount(getUserId(req));
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Search ───────────────────────────────────────────────────────────────────

export const search: RequestHandler = async (req: any, res) => {
  try {
    const query = req.query as SearchQuery;
    const { valid, errors } = validateSearchQuery(query);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const viewerId = req.user?.sub as string | undefined;
    const data = await searchService.searchAll(query, viewerId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getSocialProfile: RequestHandler = async (req: any, res) => {
  try {
    const viewerId = req.user?.sub as string | undefined;
    const data = await profileService.getSocialProfile(String(req.params.userId), viewerId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const updateSocialProfile: RequestHandler = async (req, res) => {
  try {
    const body = req.body as UpdateSocialProfileBody;
    const { valid, errors } = validateUpdateProfile(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const data = await profileService.updateSocialProfile(getUserId(req), body);
    res.json({ success: true, message: 'Profile updated successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Media (Cloudinary) ───────────────────────────────────────────────────────

export const uploadMedia: RequestHandler = async (req, res) => {
  try {
    const rawFiles = req.body?.files;
    if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'No images provided' });
    }

    const buffers: { buffer: Buffer; mimetype: string; originalname?: string }[] = [];
    for (let i = 0; i < rawFiles.length; i++) {
      const f = rawFiles[i] as { base64?: string; mimeType?: string };
      if (!f?.base64 || typeof f.base64 !== 'string') {
        return res.status(400).json({
          success: false,
          message: `files[${i}].base64 is required`,
        });
      }
      const normalized = f.base64.includes(',') ? f.base64.split(',')[1] : f.base64;
      buffers.push({
        buffer: Buffer.from(normalized, 'base64'),
        mimetype: f.mimeType || 'image/jpeg',
        originalname: `upload-${i}`,
      });
    }

    const data = await mediaService.uploadSocialImages(buffers);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Enhanced mutations (notifications) ───────────────────────────────────────

export const createReactionEnhanced: RequestHandler = async (req, res) => {
  try {
    const body = req.body as CreateReactionBody;
    const { valid, errors } = validateCreateReaction(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const data = await reactionEnhancedService.toggleReactionWithNotification(getUserId(req), body);
    res.json({ success: true, message: 'Reaction updated successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};

export const createCommentEnhanced: RequestHandler = async (req, res) => {
  try {
    const body = req.body as CreateCommentBody;
    const { valid, errors } = validateCreateComment(body);
    if (!valid) return res.status(400).json({ success: false, message: errors.join('; ') });

    const data = await commentEnhancedService.createCommentWithNotification(getUserId(req), body);
    res.status(201).json({ success: true, message: 'Comment created successfully', data });
  } catch (err) {
    handleError(res, err);
  }
};
