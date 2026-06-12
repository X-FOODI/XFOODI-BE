import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authMiddleware } from './auth';
import { ENV } from '../../config/env';

const router = Router();

cloudinary.config({
  cloud_name: ENV.CLOUDINARY.CLOUD_NAME,
  api_key: ENV.CLOUDINARY.API_KEY,
  api_secret: ENV.CLOUDINARY.API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP files are allowed'));
    }
  },
});

router.post('/image', authMiddleware, upload.single('image'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh' });
    }

    const { folder = 'xfoodi/general' } = req.body;
    const userId = req.user.sub;
    const timestamp = Date.now();

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `${userId}-${timestamp}`,
        resource_type: 'image',
        access_mode: 'public',
      },
      (error, result) => {
        if (error || !result) {
          console.error('[Upload] Cloudinary error:', error);
          return res.status(500).json({ success: false, message: 'Lỗi tải ảnh lên Cloudinary' });
        }
        return res.json({
          success: true,
          data: { url: result.secure_url },
        });
      }
    );

    stream.end(req.file.buffer);
  } catch (error) {
    console.error('[UploadRoute] POST /image error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

export default router;
