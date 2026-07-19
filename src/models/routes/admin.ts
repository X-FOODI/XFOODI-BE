import { Router, type Router as ExpressRouter } from 'express';
import { disableRestaurant, enableRestaurant, disableUser, enableUser } from '../../controllers/admin.controller';
import { authMiddleware, requireAdmin } from './auth';
import { queryAuditLogs, listAuditActions } from '../../services/audit.service';
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

export default router;
