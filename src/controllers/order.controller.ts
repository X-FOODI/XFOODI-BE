import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { prisma } from '../lib/prisma';

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
