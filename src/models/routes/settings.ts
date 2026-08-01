import { Router } from 'express';
import { centralPrisma } from '../../lib/prisma';
import redisClient from '../../lib/redis';
import { authMiddleware, requireAdmin } from './auth';
import { getAllModuleStates, getModuleState, setModuleState, recordModuleError, recoverAutoModules, CB_CONFIG } from '../../middlewares/moduleMaintenance';
import { MODULES } from '../../config/modules';
import { recordAudit } from '../../services/audit.service';

const router: Router = Router();

// ─── Bảo trì theo module ─────────────────────────────────────────────────────
// GET danh sách + trạng thái (admin)
router.get('/admin/modules', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const data = await getAllModuleStates();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy trạng thái module' });
  }
});

// PUT bật/tắt 1 module (upsert 1 key riêng → không race)
router.put('/admin/modules', authMiddleware, requireAdmin, async (req: any, res) => {
  try {
    const { key, enabled, message, estimatedFinish } = req.body || {};
    if (!MODULES.some((m) => m.key === key)) {
      return res.status(400).json({ success: false, message: 'Module không hợp lệ' });
    }
    await setModuleState(key, { enabled: !!enabled, auto: false, message: message || undefined, estimatedFinish: estimatedFinish || undefined });
    recordAudit({
      action: enabled ? 'MODULE_MAINTENANCE_ON' : 'MODULE_MAINTENANCE_OFF',
      adminId: req.user?.sub || req.user?.userId || 'unknown-admin',
      actorEmail: req.user?.email ?? null,
      actorName: req.user?.fullName || req.user?.name || null,
      targetType: 'MODULE',
      targetId: key,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
      reason: message || null,
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Settings] modules toggle error:', err?.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật module' });
  }
});

// ─── TEST PANEL (demo cho mentor) — admin-only ──────────────────────────────
// Cấu hình circuit breaker (để panel hiển thị ngưỡng)
router.get('/admin/modules/cb-config', authMiddleware, requireAdmin, async (_req, res) => {
  return res.json({ success: true, data: CB_CONFIG });
});

// Mô phỏng lỗi 500 để kích hoạt circuit breaker (hoặc ép khôi phục)
router.post('/admin/modules/simulate', authMiddleware, requireAdmin, async (req: any, res) => {
  try {
    const { key, action, count } = req.body || {};
    if (!MODULES.some((m) => m.key === key)) {
      return res.status(400).json({ success: false, message: 'Module không hợp lệ' });
    }
    if (action === 'errors') {
      const n = Math.min(Math.max(Number(count) || CB_CONFIG.threshold, 1), 20);
      for (let i = 0; i < n; i++) await recordModuleError(key);
      return res.json({ success: true, message: `Đã bơm ${n} lỗi 500 vào "${key}"`, data: await getModuleState(key) });
    }
    if (action === 'recover') {
      const s = await getModuleState(key);
      if (s.enabled && s.auto) {
        await setModuleState(key, { ...s, tripAt: new Date(0).toISOString() }); // ép hết cooldown
        await recoverAutoModules();
      }
      return res.json({ success: true, message: 'Đã ép khôi phục (half-open)', data: await getModuleState(key) });
    }
    return res.status(400).json({ success: false, message: 'action phải là "errors" hoặc "recover"' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Lỗi mô phỏng' });
  }
});

// GET trạng thái công khai (FE hiển thị màn bảo trì cục bộ)
router.get('/modules-status', async (_req, res) => {
  try {
    const all = await getAllModuleStates();
    const data = all.map((m) => ({
      key: m.key,
      label: m.label,
      enabled: m.state.enabled,
      message: m.state.message || '',
      estimatedFinish: m.state.estimatedFinish || '',
      fePrefixes: MODULES.find((x) => x.key === m.key)?.fePrefixes || [],
    }));
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy trạng thái module' });
  }
});

// GET /api/settings/admin
router.get('/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const settings = await centralPrisma.systemSetting.findMany();
    const settingsObj = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    res.json({ success: true, data: settingsObj });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/settings/admin
router.put('/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const payload = req.body;
    
    // Save to DB
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') {
        await centralPrisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value }
        });
      }
    }

    // Clear maintenance cache from Redis to apply immediately
    await redisClient.del('maintenance_mode');
    await redisClient.del('maintenance_allow_admin');
    await redisClient.del('maintenance_message');
    await redisClient.del('maintenance_finish');

    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/settings/public (for frontend to check maintenance status before login)
router.get('/public', async (req, res) => {
  try {
    let maintenanceMode = await redisClient.get('maintenance_mode');
    if (maintenanceMode === null) {
      const dbSettings = await centralPrisma.systemSetting.findMany({
        where: { key: 'maintenanceMode' }
      });
      maintenanceMode = dbSettings.find(s => s.key === 'maintenanceMode')?.value || 'false';
      await redisClient.setEx('maintenance_mode', 60, maintenanceMode);
    }
    res.json({ success: true, data: { maintenanceMode: maintenanceMode === 'true' } });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

export default router;
