import { Router } from 'express';
import { vatInvoiceService } from '../../services/vatInvoice.service';
import { authMiddleware } from './auth';
import { requireRole } from '../../middlewares/requireRole';

const router: Router = Router();

// ── Customer: request VAT invoice after payment ──────────────────────────────
// POST /api/vat-invoices
// Body: { paymentId, restaurantId, companyName, taxId, address, email }
router.post('/', async (req, res) => {
  try {
    const { paymentId, restaurantId, companyName, taxId, address, email } = req.body;

    if (!paymentId || !restaurantId || !companyName || !taxId || !address || !email) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    // Basic tax ID validation (10 or 13 digits)
    const cleanTaxId = taxId.replace(/[^0-9]/g, '');
    if (cleanTaxId.length !== 10 && cleanTaxId.length !== 13) {
      return res.status(400).json({ success: false, message: 'Mã số thuế không hợp lệ (10 hoặc 13 chữ số)' });
    }

    const result = await vatInvoiceService.createAndPublish({
      paymentId,
      restaurantId,
      companyName,
      taxId: cleanTaxId,
      address,
      email,
    });

    console.log('[VatInvoice] Result:', JSON.stringify(result));
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── Customer: get VAT invoice by payment ID ──────────────────────────────────
// GET /api/vat-invoices/by-payment/:paymentId
router.get('/by-payment/:paymentId', async (req, res) => {
  try {
    const result = await vatInvoiceService.getByPaymentId(req.params.paymentId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Owner: list VAT invoices ─────────────────────────────────────────────────
// GET /api/vat-invoices?restaurantId=xxx&page=1&limit=20
router.get('/', authMiddleware, requireRole('Owner', 'Admin'), async (req, res) => {
  try {
    const { restaurantId, page, limit } = req.query;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'restaurantId required' });
    }
    const result = await vatInvoiceService.listByRestaurant(
      restaurantId as string,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
