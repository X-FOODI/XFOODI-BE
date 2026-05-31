/**
 * User Controller — handles HTTP layer for profile management.
 *
 * Routes handled:
 *  GET  /api/users/me              → getMyProfile
 *  PUT  /api/users/me              → updateMyProfile
 *  PUT  /api/users/change-password → changePassword
 */

import type { RequestHandler } from 'express';
import {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  UserServiceError,
} from '../services/user.service';
import { validateUpdateProfile, validateChangePassword } from '../validators/user.validator';
import type { UpdateProfileBody, ChangePasswordBody } from '../types/user.types';
import { v2 as cloudinary } from 'cloudinary';
import { ENV } from '../config/env';

// Configure Cloudinary
cloudinary.config({
  cloud_name: ENV.CLOUDINARY.CLOUD_NAME,
  api_key: ENV.CLOUDINARY.API_KEY,
  api_secret: ENV.CLOUDINARY.API_SECRET,
});

// ─── Helper: extract userId from JWT payload on req.user ─────────────────────
// authMiddleware sets req.user = decoded JWT, where sub = user UUID

function getUserId(req: any): string {
  return req.user?.sub as string;
}

// ─── Helper: centralised error handler ───────────────────────────────────────

function handleError(res: any, err: unknown): void {
  if (err instanceof UserServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  const error = err as Error;
  console.error('[UserController] Unexpected error:', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

// ─── GET /api/users/me ────────────────────────────────────────────────────────

/**
 * Returns the authenticated user's profile.
 * Password is never included in the response.
 */
export const getMyProfile: RequestHandler = async (req, res) => {
  try {
    const userId = getUserId(req);
    const profile = await getUserProfile(userId);

    res.json({
      success: true,
      data: profile,
    });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── PUT /api/users/me ────────────────────────────────────────────────────────

/**
 * Updates the authenticated user's profile.
 * Allowed fields: fullName, phoneNumber, avatarUrl.
 * Email cannot be changed through this endpoint.
 */
export const updateMyProfile: RequestHandler = async (req, res) => {
  try {
    const body = req.body as UpdateProfileBody;
    const userId = getUserId(req);

    // If an avatar file was uploaded from Multer
    if (req.file) {
      const file = req.file;
      const timestamp = Date.now();
      
      console.log(`[UserController] Uploading avatar to Cloudinary for user: ${userId}`);
      
      const secureUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'xfoodi/users/avatars',
            public_id: `${userId}-avatar-${timestamp}`,
            resource_type: 'image',
            access_mode: 'public',
          },
          (error, result) => {
            if (error || !result) {
              console.error('[Cloudinary Upload Error]', error);
              return reject(error || new Error('Upload to Cloudinary failed'));
            }
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
      
      console.log(`[UserController] Avatar uploaded successfully: ${secureUrl}`);
      body.avatarUrl = secureUrl;
    }

    // Validate input
    const { valid, errors } = validateUpdateProfile(body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; '),
      });
    }

    const updated = await updateUserProfile(userId, body);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updated,
    });
  } catch (err) {
    handleError(res, err);
  }
};

// ─── PUT /api/users/change-password ──────────────────────────────────────────

/**
 * Changes the authenticated user's password.
 * Requires: currentPassword, newPassword, confirmPassword.
 */
export const changePassword: RequestHandler = async (req, res) => {
  try {
    const body = req.body as ChangePasswordBody;

    // Validate input
    const { valid, errors } = validateChangePassword(body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; '),
      });
    }

    const userId = getUserId(req);
    await changeUserPassword(userId, body.currentPassword, body.newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (err) {
    handleError(res, err);
  }
};
