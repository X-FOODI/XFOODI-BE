import { Router } from 'express';
import { centralPrisma } from '../../lib/prisma';
import redisClient from '../../lib/redis';
import { authMiddleware, requireAdmin } from '../../middlewares/auth';

const router = Router();

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
