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

// ── Public payment status poll (guest checkout QR screen) ───────────────────
router.get('/public/:id/status', async (req, res) => {
  try {
    const orderId = req.query.orderId as string | undefined;
    const result = await paymentService.getPublicPaymentStatus(req.params.id, orderId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message || 'Payment not found' });
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
  console.log('[Cash Payment API] Received request');
  console.log('[Cash Payment API] Body:', req.body);
  console.log('[Cash Payment API] User:', (req as any).user);
  
  try {
    const { orderId, reservationId, cashReceive, purpose } = req.body;
    if (!cashReceive) return res.status(400).json({ success: false, message: 'cashReceive required' });

    console.log('[Cash Payment API] Processing payment...');
    const payment = await paymentService.payCash({
      orderId,
      reservationId,
      cashReceive: Number(cashReceive),
      purpose: purpose ?? (reservationId ? PaymentPurpose.DEPOSIT : PaymentPurpose.ORDER),
    });
    
    console.log('[Cash Payment API] Payment created:', payment.id);

    // Emit socket so checkout page (customer) can detect payment and show success screen
    try {
      const { getIO } = require('../../socket');
      const { prismaStorage } = require('../../lib/prisma');
      const io = getIO();
      if (io && orderId) {
        const activeClient = prismaStorage.getStore();
        if (activeClient) {
          const order = await activeClient.order.findUnique({ where: { id: orderId }, select: { restaurantId: true } });
          if (order?.restaurantId) {
            console.log('[Cash Payment API] Emitting PAYMENT_COMPLETED to room:', `restaurant_${order.restaurantId}`);
            io.to(`restaurant_${order.restaurantId}`).emit('PAYMENT_COMPLETED', {
              paymentId: payment.id,
              orderId,
              method: 'CASH',
            });
          }
        }
      }
    } catch (socketErr: any) {
      console.warn('[Cash Payment] Socket emit failed:', socketErr.message);
    }

    return res.json({ success: true, data: payment });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Generate SePay transfer info (QR + bank details) ─────────────────────────
router.post('/transfer-info', async (req, res) => {
  try {
    const { orderId, reservationId, amount, restaurantId } = req.body;
    if (amount == null || Number(amount) <= 0 || !restaurantId) {
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
