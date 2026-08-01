import { Router } from 'express';
import { requireRole } from '../middlewares/requireRole';
import { authMiddleware } from '../models/routes/auth';
import {
  createVoucher,
  getEligibleVouchers,
  getVouchersByRestaurant,
  updateVoucher,
  deleteVoucher,
  redeemVoucher,
  getMyVouchers,
  getAllAdminVouchers,
} from '../controllers/voucher.controller';

const router: Router = Router();

// Customer actions
router.get('/eligible', getEligibleVouchers);
router.post('/redeem', authMiddleware, redeemVoucher);
router.get('/my', authMiddleware, getMyVouchers);

// Admin/Owner actions
router.get('/admin/all', authMiddleware, requireRole('Admin', 'SuperAdmin', 'System Admin'), getAllAdminVouchers);
router.post('/', authMiddleware, requireRole('Owner', 'Admin', 'SuperAdmin', 'System Admin'), createVoucher);
router.get('/restaurant/:restaurantId', authMiddleware, requireRole('Owner', 'Admin', 'SuperAdmin', 'System Admin'), getVouchersByRestaurant);
router.put('/:id', authMiddleware, requireRole('Owner', 'Admin', 'SuperAdmin', 'System Admin'), updateVoucher);
router.patch('/:id', authMiddleware, requireRole('Owner', 'Admin', 'SuperAdmin', 'System Admin'), updateVoucher);
router.delete('/:id', authMiddleware, requireRole('Owner', 'Admin', 'SuperAdmin', 'System Admin'), deleteVoucher);

export default router;
