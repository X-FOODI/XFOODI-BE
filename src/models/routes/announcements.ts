import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { listActiveAnnouncements } from '../../services/announcement.service';

const router: ExpressRouter = Router();

// Bất kỳ người dùng đã đăng nhập nào cũng xem được thông báo còn hiệu lực
router.get('/active', authMiddleware, async (_req: any, res: any) => {
  try {
    const data = await listActiveAnnouncements();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy thông báo' });
  }
});

export default router;
