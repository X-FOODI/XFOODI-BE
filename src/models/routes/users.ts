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

const router: ExpressRouter = Router();

// All user routes require a valid JWT
router.use(authMiddleware);
router.use(auditLogMiddleware);

// GET /api/users/me
router.get(API_ROUTES.USERS.ME, getMyProfile);

// PUT /api/users/me
router.put(API_ROUTES.USERS.ME, updateMyProfile);

// PUT /api/users/change-password
router.put(API_ROUTES.USERS.CHANGE_PASSWORD, changePassword);

export default router;
