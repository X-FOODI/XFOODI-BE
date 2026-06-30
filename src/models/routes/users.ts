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
import { requireRole } from '../../middlewares/requireRole';
import { prisma } from '../../lib/prisma';
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

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

// GET /api/users/admin/list
router.get('/admin/list', requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { page = '1', limit = '15', search = '' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          roles: {
            select: { role: { select: { name: true } }, restaurantId: true }
          }
        }
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: users.map(u => ({
          ...u,
          status: u.isActive, // Keep status in response to match frontend interface
          roles: u.roles.map((r: any) => r.role.name)
        })),
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      }
    });
  } catch (error) {
    console.error('Error in GET /api/users/admin/list:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PATCH /api/users/admin/:id/status
router.patch('/admin/:id/status', requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });

    if (user.id === req.user.sub) {
      return res.status(400).json({ success: false, message: 'Không thể khóa chính mình' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: isActive }
    });

    res.json({
      success: true,
      message: isActive ? 'Đã kích hoạt người dùng' : 'Đã khóa người dùng',
      data: { id: updated.id, status: updated.isActive }
    });
  } catch (error) {
    console.error('Error in PATCH /api/users/admin/:id/status:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
