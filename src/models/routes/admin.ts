import { Router, type Router as ExpressRouter } from 'express';
import { disableRestaurant, enableRestaurant, disableUser, enableUser } from '../../controllers/admin.controller';
import { authMiddleware, requireAdmin } from './auth';
import { queryAuditLogs, listAuditActions, recordAudit } from '../../services/audit.service';
import { createAnnouncement, listAnnouncements, setAnnouncementActive, deleteAnnouncement } from '../../services/announcement.service';
import { centralPrisma } from '../../lib/prisma';

const router: ExpressRouter = Router();

// Apply auth middleware and requireAdmin for all admin routes
router.use(authMiddleware, requireAdmin);

router.patch('/restaurants/:id/disable', disableRestaurant);
router.patch('/restaurants/:id/enable', enableRestaurant);

router.patch('/users/:id/disable', disableUser);
router.patch('/users/:id/enable', enableUser);

// ─── Audit Logs ───────────────────────────────────────────────────────────
router.get('/audit-logs', async (req: any, res: any) => {
  try {
    const result = await queryAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      action: req.query.action,
      adminId: req.query.adminId,
      targetType: req.query.targetType,
      targetId: req.query.targetId,
      status: req.query.status,
      search: req.query.search,
      from: req.query.from,
      to: req.query.to,
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[Admin] audit-logs error:', err?.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy nhật ký hệ thống' });
  }
});

router.get('/audit-logs/actions', async (_req: any, res: any) => {
  try {
    return res.json({ success: true, data: await listAuditActions() });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách hành động' });
  }
});

router.get('/audit-logs/:id', async (req: any, res: any) => {
  try {
    const log = await centralPrisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi' });
    return res.json({ success: true, data: log });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy chi tiết bản ghi' });
  }
});

// ─── Broadcast Announcements ──────────────────────────────────────────────
router.get('/announcements', async (req: any, res: any) => {
  try {
    const data = await listAnnouncements(Number(req.query.page) || 1, Number(req.query.limit) || 20);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy thông báo' });
  }
});

router.post('/announcements', async (req: any, res: any) => {
  try {
    const { title, content, level, expiresAt } = req.body || {};
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Tiêu đề và nội dung là bắt buộc' });
    }
    const adminId = req.user?.sub || req.user?.userId || 'unknown-admin';
    const actorName = req.user?.fullName || req.user?.name || null;
    const created = await createAnnouncement({ title: title.trim(), content: content.trim(), level, expiresAt, createdBy: adminId, actorName });
    recordAudit({
      action: 'ANNOUNCEMENT_CREATED',
      adminId,
      actorEmail: req.user?.email ?? null,
      actorName,
      targetType: 'ANNOUNCEMENT',
      targetId: created.id,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
      metadata: { title: created.title, level: created.level },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    console.error('[Admin] create announcement error:', err?.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi tạo thông báo' });
  }
});

router.patch('/announcements/:id', async (req: any, res: any) => {
  try {
    const { isActive } = req.body || {};
    const updated = await setAnnouncementActive(req.params.id, !!isActive);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thông báo' });
  }
});

router.delete('/announcements/:id', async (req: any, res: any) => {
  try {
    await deleteAnnouncement(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi xóa thông báo' });
  }
});

export default router;
