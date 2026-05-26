import type { RequestHandler } from 'express';
import { SocialServiceError } from '../middlewares/social.errors';
import * as postService from '../services/post.service';
import * as commentService from '../services/comment.service';
import * as reactionService from '../services/reaction.service';
import * as shareService from '../services/share.service';
import * as savedPostService from '../services/savedPost.service';
import { validateCreatePost, validateUpdatePost, validateListPosts } from '../validators/post.validator';
import { validateCreateComment, validateUpdateComment } from '../validators/comment.validator';
import { validateCreateReaction } from '../validators/reaction.validator';
import type {
  CreatePostBody,
  UpdatePostBody,
  ListPostsQuery,
  CreateCommentBody,
  UpdateCommentBody,
  CreateReactionBody,
} from '../interfaces/social.types';

function getUserId(req: any): string {
  return req.user?.sub as string;
}

function handleError(res: any, err: unknown): void {
  if (err instanceof SocialServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  const error = err as Error;
  console.error('[SocialController] Unexpected error:', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export const createPost: RequestHandler = async (req, res) => {
  try {
    const body = req.body as CreatePostBody;
    const { valid, errors } = validateCreatePost(body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const data = await postService.createPost(getUserId(req), body);
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const listPosts: RequestHandler = async (req: any, res) => {
  try {
    const query = req.query as ListPostsQuery;
    const { valid, errors } = validateListPosts(query);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const viewerId = req.user?.sub as string | undefined;
    const data = await postService.listPosts(query, viewerId);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const getPost: RequestHandler = async (req: any, res) => {
  try {
    const viewerId = req.user?.sub as string | undefined;
    const data = await postService.getPostById(String(req.params.id), viewerId);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const updatePost: RequestHandler = async (req, res) => {
  try {
    const body = req.body as UpdatePostBody;
    const { valid, errors } = validateUpdatePost(body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const data = await postService.updatePost(String(req.params.id), getUserId(req), body);
    res.json({
      success: true,
      message: 'Post updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const deletePost: RequestHandler = async (req, res) => {
  try {
    await postService.deletePost(String(req.params.id), getUserId(req));
    res.json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Comments ────────────────────────────────────────────────────────────────

export const listPostComments: RequestHandler = async (req: any, res) => {
  try {
    const query = req.query as ListPostsQuery;
    const { valid, errors } = validateListPosts(query);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const data = await commentService.listCommentsForPost(String(req.params.postId), query);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
};

export const createComment: RequestHandler = async (req, res) => {
  try {
    const body = req.body as CreateCommentBody;
    const { valid, errors } = validateCreateComment(body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const data = await commentService.createComment(getUserId(req), body);
    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const updateComment: RequestHandler = async (req, res) => {
  try {
    const body = req.body as UpdateCommentBody;
    const { valid, errors } = validateUpdateComment(body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const data = await commentService.updateComment(String(req.params.id), getUserId(req), body);
    res.json({
      success: true,
      message: 'Comment updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteComment: RequestHandler = async (req, res) => {
  try {
    await commentService.deleteComment(String(req.params.id), getUserId(req));
    res.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Reactions ───────────────────────────────────────────────────────────────

export const createReaction: RequestHandler = async (req, res) => {
  try {
    const body = req.body as CreateReactionBody;
    const { valid, errors } = validateCreateReaction(body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const data = await reactionService.toggleReaction(getUserId(req), body);
    res.json({
      success: true,
      message: 'Reaction updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── Share & Save ────────────────────────────────────────────────────────────

export const sharePost: RequestHandler = async (req, res) => {
  try {
    const data = await shareService.sharePost(String(req.params.postId), getUserId(req));
    res.status(201).json({
      success: true,
      message: 'Post shared successfully',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const savePost: RequestHandler = async (req, res) => {
  try {
    const data = await savedPostService.toggleSavePost(String(req.params.postId), getUserId(req));
    res.json({
      success: true,
      message: data.saved ? 'Post saved successfully' : 'Post removed from saved',
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
};
