import { Router, type Router as ExpressRouter } from 'express';
import { disableRestaurant, enableRestaurant, disableUser, enableUser } from '../../controllers/admin.controller';
import { authMiddleware, requireAdmin } from './auth';

const router: ExpressRouter = Router();

// Apply auth middleware and requireAdmin for all admin routes
router.use(authMiddleware, requireAdmin);

router.patch('/restaurants/:id/disable', disableRestaurant);
router.patch('/restaurants/:id/enable', enableRestaurant);

router.patch('/users/:id/disable', disableUser);
router.patch('/users/:id/enable', enableUser);

export default router;
