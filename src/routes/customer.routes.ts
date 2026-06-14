import { Router } from 'express';
import { getCustomers, getCustomerDetail, toggleCustomerStatus } from '../controllers/customer.controller';
import { authMiddleware } from '../models/routes/auth';

const router: Router = Router();

// Secure all customer management routes with authMiddleware
router.use(authMiddleware);

// GET /api/restaurant/customers
router.get('/', getCustomers);

// GET /api/restaurant/customers/:id
router.get('/:id', getCustomerDetail);

// PATCH /api/restaurant/customers/:id/status
router.patch('/:id/status', toggleCustomerStatus);

export default router;
