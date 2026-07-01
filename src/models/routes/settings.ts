import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { requireRole } from '../../middlewares/requireRole';
import { prisma } from '../../lib/prisma';
import { auditLogMiddleware } from '../../middlewares/auditLog';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const upload = multer({ storage: multer.memoryStorage() });

const router: ExpressRouter = Router();

// Protect all settings endpoints
router.use(authMiddleware);
router.use(auditLogMiddleware);

// GET /api/settings/admin
// Fetch all system settings
router.get('/admin', requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    // Convert array of {key, value} to an object
    const settingsObj = settings.reduce((acc: Record<string, string>, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: settingsObj
    });
  } catch (error) {
    console.error('Error in GET /api/settings/admin:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/settings/admin
// Upsert multiple system settings
router.put('/admin', requireRole('Admin', 'SuperAdmin'), upload.single('logo'), async (req: any, res: any) => {
  try {
    const settingsToUpdate = { ...req.body };
    
    if (req.file) {
      const file = req.file;
      const timestamp = Date.now();
      const secureUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'xfoodi/system',
            public_id: `system-logo-${timestamp}`,
            resource_type: 'image',
            access_mode: 'public',
          },
          (error, result) => {
            if (error || !result) return reject(error);
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
      settingsToUpdate.logo = secureUrl;
    }
    
    if (!settingsToUpdate || typeof settingsToUpdate !== 'object') {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    const keys = Object.keys(settingsToUpdate);
    
    // Process sequentially (or map to promises for parallel execution)
    const updatePromises = keys.map(key => {
      let val = settingsToUpdate[key];
      
      // Ensure values are strings for database
      if (typeof val !== 'string') {
        val = String(val);
      }
      
      return prisma.systemSetting.upsert({
        where: { key },
        update: { value: val },
        create: { key, value: val }
      });
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Cập nhật cấu hình thành công'
    });
  } catch (error) {
    console.error('Error in PUT /api/settings/admin:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lưu cấu hình' });
  }
});

export default router;
