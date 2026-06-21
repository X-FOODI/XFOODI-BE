import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { prisma } from '../lib/prisma';

/** GET /api/orders/my  — lịch sử đơn hàng của khách đang đăng nhập */
export async function getMyOrders(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để xem lịch sử đơn hàng.' });
    }

    // Find the customer record linked to this user
    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) {
      return res.json({ success: true, data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 } });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '10', 10)));
    const skip = (page - 1) * limit;

    // Fetch order status values separately to map orderStatusId to actual status values
    const statusValues = await prisma.statusValue.findMany({
      where: { statusType: { code: 'ORDER' } }
    });
    const statusMap = statusValues.reduce((acc, sv) => {
      acc[sv.id] = { code: sv.code, name: sv.name, colorCode: sv.colorCode };
      return acc;
    }, {} as Record<string, { code: string; name: string; colorCode: string | null }>);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { customerId: customer.id },
        include: {
          orderDetails: {
            include: {
              dish: { select: { id: true, name: true, price: true, imageUrl: true } },
              statusValue: { select: { code: true, name: true, colorCode: true } },
            },
          },
          tableSessions: {
            where: { isActive: true },
            include: { table: true },
          },
          restaurant: { select: { id: true, name: true, logoUrl: true, slug: true } },
          payments: {
            where: { status: 1 }, // COMPLETED
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { customerId: customer.id } }),
    ]);

    const mappedItems = orders.map((order) => {
      const activeSession = order.tableSessions[0];
      const orderStatus = statusMap[order.orderStatusId] || { code: 'PENDING', name: 'Chờ xác nhận', colorCode: '#f1c40f' };

      return {
        id: order.id,
        subTotal: Number(order.subTotal),
        totalAmount: Number(order.totalAmount),
        createdAt: order.createdAt.toISOString(),
        isPaid: order.payments.length > 0,
        statusValue: orderStatus,
        table: activeSession?.table ? {
          id: activeSession.table.id,
          name: activeSession.table.code,
          code: activeSession.table.code
        } : undefined,
        restaurant: order.restaurant ? {
          id: order.restaurant.id,
          name: order.restaurant.name,
          logoUrl: order.restaurant.logoUrl,
          slug: order.restaurant.slug
        } : undefined,
        orderDetails: order.orderDetails.map(detail => ({
          id: detail.id,
          quantity: detail.quantity,
          unitPrice: Number(detail.unitPrice),
          note: detail.note ?? undefined,
          dish: detail.dish ? {
            id: detail.dish.id,
            name: detail.dish.name,
            price: Number(detail.dish.price),
            imageUrl: detail.dish.imageUrl ?? undefined
          } : { id: '', name: 'Món ăn', price: 0 },
          statusValue: detail.statusValue ? {
            code: detail.statusValue.code,
            name: detail.statusValue.name,
            colorCode: detail.statusValue.colorCode ?? '#f1c40f'
          } : undefined
        }))
      };
    });

    return res.json({
      success: true,
      data: {
        items: mappedItems,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[OrderController] getMyOrders error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy lịch sử đơn hàng' });
  }
}

export async function createOrder(req: any, res: Response) {
  try {
    const { tableId, items, customerId } = req.body;
    if (!tableId) {
      return res.status(400).json({ success: false, message: 'tableId is required' });
    }

    let restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      // If client is a customer (no auth token), look up the table to find its restaurantId
      const table = await prisma.table.findUnique({
        where: { id: tableId },
      });
      if (!table) {
        return res.status(404).json({ success: false, message: 'Bàn ăn không tồn tại' });
      }
      restaurantId = table.restaurantId;
    }

    const order = await orderService.createOrder(restaurantId, {
      tableId,
      customerId,
      items,
    });

    return res.status(201).json({
      success: true,
      message: 'Đặt món thành công',
      data: order,
    });
  } catch (error: any) {
    console.error('[OrderController] createOrder error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi gọi món',
    });
  }
}

export async function listOrders(req: any, res: Response) {
  try {
    let restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      if (req.query.tableId) {
        const table = await prisma.table.findUnique({
          where: { id: req.query.tableId as string },
        });
        if (!table) {
          return res.status(404).json({ success: false, message: 'Bàn ăn không tồn tại' });
        }
        restaurantId = table.restaurantId;
      } else {
        return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
      }
    }

    const { status, tableId, page, limit } = req.query;
    const orders = await orderService.listOrders(restaurantId, {
      status: status as string,
      tableId: tableId as string,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return res.json({ success: true, data: orders });
  } catch (error: any) {
    console.error('[OrderController] listOrders error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi lấy danh sách đơn hàng',
    });
  }
}

export async function getOrderById(req: any, res: Response) {
  try {
    const { id } = req.params;
    // We fetch the order from the database first to verify it belongs to the restaurant if the user is logged in
    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại' });
    }

    const restaurantId = req.user?.restaurantId || order.restaurantId;
    if (req.user?.restaurantId && req.user.restaurantId !== order.restaurantId) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập đơn hàng này' });
    }

    const result = await orderService.getOrderById(restaurantId, id);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[OrderController] getOrderById error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi lấy chi tiết đơn hàng',
    });
  }
}

export async function updateOrderStatus(req: any, res: Response) {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const updated = await orderService.updateOrderStatus(restaurantId, req.params.id, status);
    return res.json({
      success: true,
      message: 'Cập nhật trạng thái đơn hàng thành công',
      data: updated,
    });
  } catch (error: any) {
    console.error('[OrderController] updateOrderStatus error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi cập nhật trạng thái đơn hàng',
    });
  }
}

export async function updateOrderDetailStatus(req: any, res: Response) {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const updated = await orderService.updateOrderDetailStatus(restaurantId, req.params.detailId, status);
    return res.json({
      success: true,
      message: 'Cập nhật trạng thái món ăn thành công',
      data: updated,
    });
  } catch (error: any) {
    console.error('[OrderController] updateOrderDetailStatus error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi cập nhật trạng thái món ăn',
    });
  }
}
