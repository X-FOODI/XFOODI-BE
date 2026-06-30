/**
 * User routes — all protected by JWT via authMiddleware.
 *
 * GET  /api/users/me              → get profile
 * PUT  /api/users/me              → update profile
 * PUT  /api/users/change-password → change password
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from '../models/routes/auth';
import { getMyProfile, updateMyProfile, changePassword } from '../controllers/user.controller';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router: ExpressRouter = Router();

router.use(authMiddleware);

router.get('/me', getMyProfile);
router.put('/me', upload.single('avatar'), updateMyProfile);
router.put('/change-password', changePassword);

export default router;
