/**
 * Social Community extension routes (additive — does not replace legacy routes).
 *
 * FEEDS       GET  /api/social/feed/:feed (latest|trending|following|profile)
 * HASHTAGS    GET  /api/social/hashtags/trending
 *             GET  /api/social/hashtags/:tag/posts
 * FOLLOWS     POST /api/social/follows/:userId
 *             DELETE /api/social/follows/:userId
 *             GET  /api/social/follows/:userId/stats
 *             GET  /api/social/follows/:userId/followers
 *             GET  /api/social/follows/:userId/following
 * NOTIFICATIONS GET/PATCH /api/social/notifications
 * SEARCH      GET  /api/social/search
 * PROFILE     GET/PATCH /api/social/profile/:userId
 * MEDIA       POST /api/social/media/upload
 * ENHANCED    POST /api/social/v2/posts, PATCH /api/social/v2/posts/:id
 *             POST /api/social/v2/reactions, POST /api/social/v2/comments
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from '../../../models/routes/auth';
import { optionalAuthMiddleware } from '../middlewares/optional-auth.middleware';
import { socialRateLimitMiddleware } from '../middlewares/social-rate-limit.middleware';
import { listSavedPosts } from '../controllers/social.controller';
import {
  createPostEnhanced,
  updatePostEnhanced,
  getFeed,
  getTrendingHashtags,
  getHashtagPage,
  followUser,
  unfollowUser,
  getFollowStats,
  listFollowers,
  listFollowing,
  listNotifications,
  markNotificationsRead,
  getUnreadNotificationCount,
  search,
  getSocialProfile,
  updateSocialProfile,
  uploadMedia,
  createReactionEnhanced,
  createCommentEnhanced,
} from '../controllers/community.controller';

const router: ExpressRouter = Router();
const writeLimit = socialRateLimitMiddleware('social:write');

// Public / optional auth reads
router.get('/feed/:feed', optionalAuthMiddleware, getFeed);
router.get('/hashtags/trending', getTrendingHashtags);
router.get('/hashtags/:tag/posts', optionalAuthMiddleware, getHashtagPage);
router.get('/search', optionalAuthMiddleware, search);
router.get('/profile/:userId', optionalAuthMiddleware, getSocialProfile);
router.get('/follows/:userId/stats', getFollowStats);
router.get('/follows/:userId/followers', listFollowers);
router.get('/follows/:userId/following', listFollowing);

// Authenticated
router.post('/v2/posts', authMiddleware, writeLimit, createPostEnhanced);
router.patch('/v2/posts/:id', authMiddleware, writeLimit, updatePostEnhanced);
router.post('/v2/reactions', authMiddleware, writeLimit, createReactionEnhanced);
router.post('/v2/comments', authMiddleware, writeLimit, createCommentEnhanced);

router.post('/follows/:userId', authMiddleware, writeLimit, followUser);
router.delete('/follows/:userId', authMiddleware, writeLimit, unfollowUser);

router.get('/notifications', authMiddleware, listNotifications);
router.get('/notifications/unread-count', authMiddleware, getUnreadNotificationCount);
router.patch('/notifications/read', authMiddleware, markNotificationsRead);

router.patch('/profile/me', authMiddleware, writeLimit, updateSocialProfile);

router.post('/media/upload', authMiddleware, writeLimit, uploadMedia);

/** Alias for legacy GET /saved — SocialBookmark concept */
router.get('/bookmarks', authMiddleware, listSavedPosts);

export default router;
