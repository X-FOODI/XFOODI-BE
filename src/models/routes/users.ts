/**
 * User routes — profile management.
 *
 * All routes are protected by authMiddleware (JWT required).
 *
 * GET  /api/users/me              → get current user's profile
 * PUT  /api/users/me              → update current user's profile
 * PUT  /api/users/change-password → change current user's password
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { getMyProfile, updateMyProfile, changePassword } from '../../controllers/user.controller';
import { API_ROUTES } from '../../constants/routes';
import { auditLogMiddleware } from '../../middlewares/auditLog';
import multer from 'multer';

const router: ExpressRouter = Router();

// Configure Multer for avatar upload in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận các định dạng file ảnh JPG, PNG, WebP, GIF'));
    }
  }
});

// All user routes require a valid JWT
router.use(authMiddleware);
router.use(auditLogMiddleware);

// GET /api/users/me
router.get(API_ROUTES.USERS.ME, getMyProfile);

// PUT /api/users/me — supports profile updates and file uploads for avatars
router.put(API_ROUTES.USERS.ME, upload.single('avatar'), updateMyProfile);

// PUT /api/users/change-password
router.put(API_ROUTES.USERS.CHANGE_PASSWORD, changePassword);

export default router;
