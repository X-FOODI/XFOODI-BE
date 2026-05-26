/**
 * Social Community / Blog routes
 *
 * POSTS
 *   POST   /api/social/posts
 *   GET    /api/social/posts
 *   GET    /api/social/posts/:id
 *   PATCH  /api/social/posts/:id
 *   DELETE /api/social/posts/:id
 *
 * COMMENTS
 *   POST   /api/social/comments
 *   PATCH  /api/social/comments/:id
 *   DELETE /api/social/comments/:id
 *
 * REACTIONS
 *   POST   /api/social/reactions
 *
 * SHARES
 *   POST   /api/social/share/:postId
 *
 * SAVED
 *   POST   /api/social/save/:postId
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from '../../../routes/auth';
import { optionalAuthMiddleware } from '../middlewares/optional-auth.middleware';
import {
  createPost,
  listPosts,
  getPost,
  updatePost,
  deletePost,
  listPostComments,
  createComment,
  updateComment,
  deleteComment,
  createReaction,
  sharePost,
  savePost,
} from '../controllers/social.controller';

const router: ExpressRouter = Router();

// Public read with optional auth (viewer reaction/saved state)
router.get('/posts', optionalAuthMiddleware, listPosts);
router.get('/posts/:postId/comments', optionalAuthMiddleware, listPostComments);
router.get('/posts/:id', optionalAuthMiddleware, getPost);

// Authenticated mutations
router.post('/posts', authMiddleware, createPost);
router.patch('/posts/:id', authMiddleware, updatePost);
router.delete('/posts/:id', authMiddleware, deletePost);

router.post('/comments', authMiddleware, createComment);
router.patch('/comments/:id', authMiddleware, updateComment);
router.delete('/comments/:id', authMiddleware, deleteComment);

router.post('/reactions', authMiddleware, createReaction);

router.post('/share/:postId', authMiddleware, sharePost);
router.post('/save/:postId', authMiddleware, savePost);

export default router;
