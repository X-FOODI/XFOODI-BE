import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authMiddleware } from './auth';
import { ENV } from '../../config/env';
import QRCode from 'qrcode';

const router: Router = Router();

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

router.get('/qr', async (req: any, res: any) => {
  try {
    const { text } = req.query;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung QR' });
    }

    let qrText = text as string;
    if (qrText.startsWith('/')) {
      const referer = req.headers.referer || req.headers.referrer;
      let origin = 'http://localhost:3000';
      if (referer) {
        try {
          origin = new URL(referer).origin;
        } catch (e) {
          // ignore
        }
      }
      qrText = `${origin}${qrText}`;
    }

    const buffer = await QRCode.toBuffer(qrText, {
      type: 'png',
      width: 300,
      margin: 2,
    });

    res.setHeader('Content-Type', 'image/png');
    return res.send(buffer);
  } catch (error) {
    console.error('[UploadRoute] GET /qr error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi tạo mã QR.' });
  }
});

export default router;
