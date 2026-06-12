import { Router } from 'express';
import { getIO } from '../../socket';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';

const router = Router();

// Test API to simulate a new order coming from a customer
router.post('/test', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    // Mock order payload
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

    // Broadcast to the restaurant room
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

export default router;
