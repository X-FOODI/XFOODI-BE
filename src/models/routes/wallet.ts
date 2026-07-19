import { Router } from 'express';
import { walletService } from '../../services/wallet.service';
import { requireRole } from '../../middlewares/requireRole';
import { authMiddleware } from './auth';

const router: Router = Router();

// ── Public Test Endpoint: Direct PayOS Payout (For Postman testing) ──────────
router.post('/test-direct-payout', async (req: any, res) => {
  try {
    const { amount, bankBin, accountNumber, description } = req.body;
    if (!amount || !bankBin || !accountNumber) {
      return res.status(400).json({ success: false, message: 'Thiếu amount, bankBin, hoặc accountNumber trong body.' });
    }
    const data = await walletService.directPayout({
      amount: Number(amount),
      bankBin,
      accountNumber,
      description,
    });
    return res.json({ success: true, message: 'Yêu cầu chuyển tiền qua PayOS thành công!', data });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.use(authMiddleware);

// ── Owner: Get wallet info ─────────────────────────────────────────────────────
router.get('/', requireRole('Owner', 'Admin'), async (req: any, res) => {
  try {
    const restaurantId = req.restaurant?.id;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant context required' });
    }
    const data = await walletService.getWallet(restaurantId);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Owner: Request withdrawal ─────────────────────────────────────────────────
router.post('/withdraw', requireRole('Owner', 'Admin'), async (req: any, res) => {
  try {
    const restaurantId = req.restaurant?.id;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant context required' });
    }

    const { amount, bankCode, bankBin, accountNumber, accountName } = req.body;

    if (!amount || !bankCode || !bankBin || !accountNumber || !accountName) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin ngân hàng' });
    }

    const request = await walletService.requestWithdrawal({
      restaurantId,
      amount: Number(amount),
      bankCode,
      bankBin,
      accountNumber,
      accountName,
    });

    return res.json({ success: true, data: request });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Owner: Get withdrawal history ─────────────────────────────────────────────
router.get('/withdrawals', requireRole('Owner', 'Admin'), async (req: any, res) => {
  try {
    const restaurantId = req.restaurant?.id;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant context required' });
    }

    const { page, limit } = req.query;
    const data = await walletService.listWithdrawals({
      restaurantId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: List all withdrawal requests ───────────────────────────────────────
router.get('/admin/withdrawals', requireRole('Admin'), async (req: any, res) => {
  try {
    const { status, page, limit } = req.query;
    const data = await walletService.listWithdrawals({
      status: status as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: Approve withdrawal ─────────────────────────────────────────────────
router.post('/admin/withdrawals/:id/approve', requireRole('Admin'), async (req: any, res) => {
  try {
    const { adminNote } = req.body;
    const result = await walletService.approveWithdrawal(req.params.id, adminNote);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Admin: Reject withdrawal ──────────────────────────────────────────────────
router.post('/admin/withdrawals/:id/reject', requireRole('Admin'), async (req: any, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Lý do từ chối bắt buộc' });
    }
    await walletService.rejectWithdrawal(req.params.id, reason);
    return res.json({ success: true, message: 'Đã từ chối yêu cầu rút tiền' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
