import { Router, Request, Response } from 'express';
import { paymentService } from '../../services/payment.service';
import { requireRole } from '../../middlewares/requireRole';
import { PaymentPurpose } from '../../enums/payment.enum';
import { authMiddleware } from './auth';

const router: Router = Router();

// ── List payments (staff/admin) ──────────────────────────────────────────────
router.get('/', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const { restaurantId, page, limit, status, from, to, purpose } = req.query;
    const result = await paymentService.listPayments({
      restaurantId: restaurantId as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status !== undefined ? Number(status) : undefined,
      purpose: purpose !== undefined ? Number(purpose) : undefined,
      from: from as string,
      to: to as string,
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get payment by ID ────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const payment = await paymentService.getById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    return res.json({ success: true, data: payment });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Cash payment ─────────────────────────────────────────────────────────────
router.post('/cash', authMiddleware, requireRole('Owner', 'Admin', 'Staff'), async (req, res) => {
  try {
    const { orderId, reservationId, cashReceive, purpose } = req.body;
    if (!cashReceive) return res.status(400).json({ success: false, message: 'cashReceive required' });

    const payment = await paymentService.payCash({
      orderId,
      reservationId,
      cashReceive: Number(cashReceive),
      purpose: purpose ?? (reservationId ? PaymentPurpose.DEPOSIT : PaymentPurpose.ORDER),
    });
    return res.json({ success: true, data: payment });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Generate SePay transfer info (QR + bank details) ─────────────────────────
router.post('/transfer-info', async (req, res) => {
  try {
    const { orderId, reservationId, amount, restaurantId } = req.body;
    if (!amount || !restaurantId) {
      return res.status(400).json({ success: false, message: 'amount and restaurantId required' });
    }

    const info = await paymentService.generateTransferInfo({
      orderId,
      reservationId,
      amount: Number(amount),
      restaurantId,
    });
    return res.json({ success: true, data: info });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── SePay Webhook ─────────────────────────────────────────────────────────────
// Must be public (no auth) — SePay calls this when it detects a bank transfer.
// Secured via SEPAY_WEBHOOK_TOKEN header.
router.post('/sepay-webhook', async (req, res) => {
  try {
    const token = (req.headers['authorization'] ?? '').replace('Apikey ', '').trim();
    const result = await paymentService.handleSePayWebhook(req.body, token);
    // SePay expects { success: true } with HTTP 200
    return res.json(result);
  } catch (err: any) {
    console.error('[SePay Webhook Error]', err.message);
    // Still return 200 to prevent SePay retries for auth errors
    return res.status(200).json({ success: false, message: err.message });
  }
});

export default router;
