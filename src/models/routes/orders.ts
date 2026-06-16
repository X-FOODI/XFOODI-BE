import { Router } from 'express';
import { authMiddleware } from './auth';
import {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  updateOrderDetailStatus,
} from '../../controllers/order.controller';
import { getIO } from '../../socket';

const router: Router = Router();

// ── Test API ─────────────────────────────────────────────────────────────────
// Simulates a mock order broadcast for testing socket connections.
router.post('/test', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const mockOrder = {
      id: 'ord_' + Math.random().toString(36).substr(2, 9),
      restaurantId,
      subTotal: 150000,
      totalAmount: 150000,
      createdAt: new Date(),
      status: 'NEW',
      items: [
        { name: 'Cơm Tấm Sườn Bì Chả', quantity: 2, price: 60000, note: 'Không mỡ hành' },
        { name: 'Trà Đá', quantity: 2, price: 15000 }
      ],
      table: 'Bàn 3',
    };

    const io = getIO();
    io.to(`restaurant_${restaurantId}`).emit('NEW_ORDER', mockOrder);

    return res.json({
      success: true,
      message: 'Mock order created and broadcasted successfully',
      data: mockOrder
    });
  } catch (error) {
    console.error('[OrdersRoute] POST /test error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Real Order API Endpoints ─────────────────────────────────────────────────

// 1. Create a new order (Public - guest scans QR or staff logs it)
router.post('/', createOrder);

// 2. List all orders (Protected - for restaurant staff/owners, but public if tableId is provided)
router.get('/', (req: any, res: any, next: any) => {
  if (req.query.tableId) {
    return next();
  }
  return authMiddleware(req, res, next);
}, listOrders);

// 3. Get single order details (Public - guests track their order via UUID)
router.get('/:id', getOrderById);

// 4. Update order status (Protected - staff confirms or completes order)
router.patch('/:id/status', authMiddleware, updateOrderStatus);

// 5. Update individual dish item status (Protected - kitchen cooking update)
router.patch('/items/:detailId/status', authMiddleware, updateOrderDetailStatus);

export default router;
