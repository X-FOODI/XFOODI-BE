import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { getIO } from '../socket';

export class OrderServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'OrderServiceError';
    Object.setPrototypeOf(this, OrderServiceError.prototype);
  }
}

// Helpers: Self-healing statuses
async function ensureOrderStatuses(): Promise<Record<string, string>> {
  let statusType = await prisma.statusType.findUnique({
    where: { code: 'ORDER' },
  });
  if (!statusType) {
    statusType = await prisma.statusType.create({
      data: { code: 'ORDER' },
    });
  }

  const defaultStatuses = [
    { code: 'PENDING', name: 'Chờ xác nhận', colorCode: '#f1c40f', isDefault: true },
    { code: 'CONFIRMED', name: 'Đã xác nhận', colorCode: '#3498db', isDefault: false },
    { code: 'COMPLETED', name: 'Hoàn thành', colorCode: '#2ecc71', isDefault: false },
    { code: 'CANCELLED', name: 'Đã hủy', colorCode: '#95a5a6', isDefault: false },
  ];

  const map: Record<string, string> = {};
  for (const s of defaultStatuses) {
    let val = await prisma.statusValue.findFirst({
      where: { statusTypeId: statusType.id, code: s.code },
    });
    if (!val) {
      val = await prisma.statusValue.create({
        data: {
          statusTypeId: statusType.id,
          code: s.code,
          name: s.name,
          colorCode: s.colorCode,
          isDefault: s.isDefault,
          isSystem: true,
        },
      });
    }
    map[s.code] = val.id;
  }
  return map;
}

async function ensureOrderDetailStatuses(): Promise<Record<string, string>> {
  let statusType = await prisma.statusType.findUnique({
    where: { code: 'ORDER_DETAIL' },
  });
  if (!statusType) {
    statusType = await prisma.statusType.create({
      data: { code: 'ORDER_DETAIL' },
    });
  }

  const defaultStatuses = [
    { code: 'PENDING', name: 'Chờ làm', colorCode: '#f39c12', isDefault: true },
    { code: 'COOKING', name: 'Đang làm', colorCode: '#3498db', isDefault: false },
    { code: 'COMPLETED', name: 'Hoàn thành', colorCode: '#2ecc71', isDefault: false },
    { code: 'SERVED', name: 'Đã phục vụ', colorCode: '#27ae60', isDefault: false },
    { code: 'CANCELLED', name: 'Đã hủy', colorCode: '#95a5a6', isDefault: false },
  ];

  const map: Record<string, string> = {};
  for (const s of defaultStatuses) {
    let val = await prisma.statusValue.findFirst({
      where: { statusTypeId: statusType.id, code: s.code },
    });
    if (!val) {
      val = await prisma.statusValue.create({
        data: {
          statusTypeId: statusType.id,
          code: s.code,
          name: s.name,
          colorCode: s.colorCode,
          isDefault: s.isDefault,
          isSystem: true,
        },
      });
    }
    map[s.code] = val.id;
  }
  return map;
}

async function ensureTableOccupiedStatus(): Promise<string> {
  let statusType = await prisma.statusType.findUnique({
    where: { code: 'TABLE' },
  });
  if (!statusType) {
    statusType = await prisma.statusType.create({
      data: { code: 'TABLE' },
    });
  }

  let statusValue = await prisma.statusValue.findFirst({
    where: { statusTypeId: statusType.id, code: 'OCCUPIED' },
  });

  if (!statusValue) {
    statusValue = await prisma.statusValue.create({
      data: {
        statusTypeId: statusType.id,
        code: 'OCCUPIED',
        name: 'Occupied',
        colorCode: '#e74c3c',
        isDefault: false,
        isSystem: true,
      },
    });
  }

  return statusValue.id;
}

export class OrderService {
  /**
   * Hardcoded logic to replace the legacy trigger system.
   * When an order's status changes, we update all its order details to the new status.
   */
  async onOrderStatusChanged(orderId: string, newStatusId: string): Promise<void> {
    await prisma.orderDetail.updateMany({
      where: { orderId },
      data: { itemStatusId: newStatusId },
    });
  }

  /**
   * Create an order from a table QR code or staff input.
   * If the table already has an active session with an order, we append items instead of making a new order.
   */
  async createOrder(
    restaurantId: string,
    data: {
      tableId: string;
      customerId?: string;
      items: Array<{ dishId: string; quantity: number; note?: string }>;
    }
  ) {
    if (data.items.length === 0) {
      throw new OrderServiceError(400, 'Danh sách món ăn trống');
    }

    const orderStatusMap = await ensureOrderStatuses();
    const itemStatusMap = await ensureOrderDetailStatuses();
    const occupiedTableStatusId = await ensureTableOccupiedStatus();

    // 1. Get Table
    const table = await prisma.table.findFirst({
      where: { id: data.tableId, restaurantId, isActive: true },
    });
    if (!table) {
      throw new OrderServiceError(404, 'Bàn ăn không tồn tại');
    }

    // 2. Fetch Dish Prices
    const dishIds = data.items.map((item) => item.dishId);
    const dishes = await prisma.dish.findMany({
      where: { id: { in: dishIds }, restaurantId, isActive: true },
    });
    if (dishes.length !== dishIds.length) {
      throw new OrderServiceError(400, 'Một số món ăn không hợp lệ hoặc đã dừng bán');
    }

    const dishPriceMap = dishes.reduce((acc, dish) => {
      acc[dish.id] = { price: Number(dish.price), name: dish.name };
      return acc;
    }, {} as Record<string, { price: number; name: string }>);

    // 3. Find or Create Table Session
    let activeSession = await prisma.tableSession.findFirst({
      where: { tableId: data.tableId, isActive: true },
    });

    return await prisma.$transaction(async (tx) => {
      if (!activeSession) {
        // Create active session
        activeSession = await tx.tableSession.create({
          data: {
            tableId: data.tableId,
            startedAt: new Date(),
            isActive: true,
          },
        });

        // Set Table status to Occupied
        await tx.table.update({
          where: { id: data.tableId },
          data: { tableStatusId: occupiedTableStatusId },
        });
      }

      let order: any;

      if (activeSession.orderId) {
        // Append items to existing order
        order = await tx.order.findUnique({
          where: { id: activeSession.orderId },
          include: { orderDetails: true },
        });

        if (!order) {
          throw new OrderServiceError(500, 'Không tìm thấy thông tin đơn hàng gắn liền với phiên bàn');
        }

        // Add new order details
        for (const item of data.items) {
          const dishInfo = dishPriceMap[item.dishId];
          await tx.orderDetail.create({
            data: {
              orderId: order.id,
              dishId: item.dishId,
              quantity: item.quantity,
              note: item.note || null,
              itemStatusId: itemStatusMap['PENDING'],
              unitPrice: new Prisma.Decimal(dishInfo.price),
            },
          });
        }
      } else {
        // Create new Order
        const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
        const count = await tx.order.count({
          where: { restaurantId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        const reference = `ORD-${todayStr}-${(count + 1).toString().padStart(4, '0')}`;

        order = await tx.order.create({
          data: {
            reference,
            restaurantId,
            customerId: data.customerId || null,
            orderStatusId: orderStatusMap['PENDING'],
            subTotal: 0,
            discountAmount: 0,
            taxAmount: 0,
            serviceCharge: 0,
            totalAmount: 0,
          },
        });

        // Link Order to active session
        await tx.tableSession.update({
          where: { id: activeSession.id },
          data: { orderId: order.id },
        });

        // Create order details
        for (const item of data.items) {
          const dishInfo = dishPriceMap[item.dishId];
          await tx.orderDetail.create({
            data: {
              orderId: order.id,
              dishId: item.dishId,
              quantity: item.quantity,
              note: item.note || null,
              itemStatusId: itemStatusMap['PENDING'],
              unitPrice: new Prisma.Decimal(dishInfo.price),
            },
          });
        }
      }

      // 4. Recalculate totals
      const allDetails = await tx.orderDetail.findMany({
        where: { orderId: order.id },
      });

      const subTotal = allDetails.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
      const taxAmount = subTotal * 0.1; // Standard 10% tax
      const totalAmount = subTotal + taxAmount;

      order = await tx.order.update({
        where: { id: order.id },
        data: {
          subTotal: new Prisma.Decimal(subTotal),
          taxAmount: new Prisma.Decimal(taxAmount),
          totalAmount: new Prisma.Decimal(totalAmount),
        },
        include: {
          orderDetails: {
            include: {
              dish: { select: { name: true, price: true, imageUrl: true } },
              statusValue: { select: { code: true, name: true, colorCode: true } },
            },
          },
          customer: {
            include: {
              user: true,
            },
          },
        },
      });

      // Broadcast new order to Socket.io room
      const io = getIO();
      const broadcastPayload = {
        id: order.id,
        reference: order.reference,
        table: table.code,
        tableId: table.id,
        subTotal,
        totalAmount,
        createdAt: order.createdAt,
        status: 'PENDING',
        customerName: order.customer?.user?.fullName || order.customer?.user?.userName || null,
        customerPhone: order.customer?.user?.phoneNumber || null,
        customerEmail: order.customer?.user?.email || null,
        items: order.orderDetails.map((d: any) => ({
          id: d.id,
          name: d.dish?.name || 'Món ăn',
          imageUrl: d.dish?.imageUrl || null,
          quantity: d.quantity,
          price: Number(d.unitPrice),
          note: d.note,
          status: d.statusValue?.code,
          statusName: d.statusValue?.name,
        })),
      };

      io.to(`restaurant_${restaurantId}`).emit('NEW_ORDER', broadcastPayload);

      return broadcastPayload;
    });
  }

  /**
   * List all active/historical orders in the restaurant
   */
  async listOrders(
    restaurantId: string,
    filters: { status?: string; tableId?: string; page?: number; limit?: number }
  ) {
    const statusMap = await ensureOrderStatuses();
    const statusIdToCode = Object.entries(statusMap).reduce((acc, [code, id]) => {
      acc[id] = code;
      return acc;
    }, {} as Record<string, string>);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const whereClause: any = { restaurantId };
    if (filters.status) {
      const sId = statusMap[filters.status.toUpperCase()];
      if (sId) {
        whereClause.orderStatusId = sId;
      }
    }
    if (filters.tableId) {
      whereClause.tableSessions = {
        some: { tableId: filters.tableId, isActive: true },
      };
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        orderDetails: {
          include: {
            dish: true,
            statusValue: true,
          },
        },
        tableSessions: {
          where: { isActive: true },
          include: { table: true },
        },
        customer: {
          include: {
            user: true,
          },
        },
        payments: {
          where: { status: 1 }, // COMPLETED
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return orders.map((o) => {
      const activeSession = o.tableSessions[0];
      return {
        id: o.id,
        reference: o.reference,
        subTotal: Number(o.subTotal),
        totalAmount: Number(o.totalAmount),
        createdAt: o.createdAt,
        status: statusIdToCode[o.orderStatusId] || 'PENDING',
        isPaid: o.payments.length > 0,
        table: activeSession?.table?.code || 'Mang đi',
        tableId: activeSession?.table?.id || null,
        customerName: o.customer?.user?.fullName || o.customer?.user?.userName || null,
        customerPhone: o.customer?.user?.phoneNumber || null,
        customerEmail: o.customer?.user?.email || null,
        items: o.orderDetails.map((d) => ({
          id: d.id,
          name: d.dish?.name || 'Món ăn',
          imageUrl: d.dish?.imageUrl || null,
          quantity: d.quantity,
          price: Number(d.unitPrice),
          note: d.note,
          status: d.statusValue?.code,
          statusName: d.statusValue?.name,
        })),
      };
    });
  }

  /**
   * Get order by ID
   */
  async getOrderById(restaurantId: string, orderId: string) {
    const statusMap = await ensureOrderStatuses();
    const statusIdToCode = Object.entries(statusMap).reduce((acc, [code, id]) => {
      acc[id] = code;
      return acc;
    }, {} as Record<string, string>);

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        orderDetails: {
          include: {
            dish: true,
            statusValue: true,
          },
        },
        tableSessions: {
          include: { table: true },
        },
        customer: {
          include: {
            user: true,
          },
        },
        payments: {
          where: { status: 1 }, // COMPLETED
        },
      },
    });

    if (!order) {
      throw new OrderServiceError(404, 'Đơn hàng không tồn tại');
    }

    const activeSession = order.tableSessions.find((s) => s.isActive);
    return {
      id: order.id,
      reference: order.reference,
      subTotal: Number(order.subTotal),
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt,
      status: statusIdToCode[order.orderStatusId] || 'PENDING',
      isPaid: order.payments.length > 0,
      table: activeSession?.table?.code || 'Mang đi',
      tableId: activeSession?.table?.id || null,
      customerName: order.customer?.user?.fullName || order.customer?.user?.userName || null,
      customerPhone: order.customer?.user?.phoneNumber || null,
      customerEmail: order.customer?.user?.email || null,
      items: order.orderDetails.map((d) => ({
        id: d.id,
        name: d.dish?.name || 'Món ăn',
        imageUrl: d.dish?.imageUrl || null,
        quantity: d.quantity,
        price: Number(d.unitPrice),
        note: d.note,
        status: d.statusValue?.code,
        statusName: d.statusValue?.name,
      })),
    };
  }

  /**
   * Update entire order status (e.g. confirm order or complete checkout)
   */
  async updateOrderStatus(restaurantId: string, orderId: string, status: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
    });
    if (!order) {
      throw new OrderServiceError(404, 'Đơn hàng không tồn tại');
    }

    const statusMap = await ensureOrderStatuses();
    const statusId = statusMap[status.toUpperCase()];
    if (!statusId) {
      throw new OrderServiceError(400, 'Trạng thái đơn hàng không hợp lệ');
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatusId: statusId },
    });

    // Sync order items status when order status changes
    const itemStatusMap = await ensureOrderDetailStatuses();
    let targetItemStatus: string | null = null;
    if (status.toUpperCase() === 'CONFIRMED') {
      targetItemStatus = 'COOKING';
    } else if (status.toUpperCase() === 'COMPLETED') {
      targetItemStatus = 'COMPLETED';
    } else if (status.toUpperCase() === 'CANCELLED') {
      targetItemStatus = 'CANCELLED';
    }

    if (targetItemStatus && itemStatusMap[targetItemStatus]) {
      await prisma.orderDetail.updateMany({
        where: { orderId },
        data: { itemStatusId: itemStatusMap[targetItemStatus] },
      });
    }

    const payments = await prisma.payment.findFirst({
      where: { orderId, status: 1 }, // COMPLETED payment status
    });
    const isPaid = !!payments;

    // Notify via Socket.io
    const io = getIO();
    io.to(`restaurant_${restaurantId}`).emit('ORDER_STATUS_CHANGED', {
      orderId,
      status: status.toUpperCase(),
      isPaid,
    });

    return updated;
  }

  /**
   * Update status of a single dish item in the kitchen screen (PENDING -> COOKING -> COMPLETED -> SERVED)
   */
  async updateOrderDetailStatus(restaurantId: string, detailId: string, status: string) {
    const detail = await prisma.orderDetail.findUnique({
      where: { id: detailId },
      include: {
        order: {
          select: { restaurantId: true, id: true, reference: true },
        },
      },
    });

    if (!detail || detail.order.restaurantId !== restaurantId) {
      throw new OrderServiceError(404, 'Món ăn không tồn tại trong đơn hàng');
    }

    const itemStatusMap = await ensureOrderDetailStatuses();
    const statusId = itemStatusMap[status.toUpperCase()];
    if (!statusId) {
      throw new OrderServiceError(400, 'Trạng thái món ăn không hợp lệ');
    }

    const updated = await prisma.orderDetail.update({
      where: { id: detailId },
      data: { itemStatusId: statusId },
      include: {
        dish: { select: { name: true } },
        statusValue: { select: { code: true, name: true } },
      },
    });

    // Notify clients in real-time
    const io = getIO();
    io.to(`restaurant_${restaurantId}`).emit('ORDER_ITEM_STATUS_CHANGED', {
      orderId: detail.order.id,
      orderReference: detail.order.reference,
      itemId: updated.id,
      name: updated.dish?.name || 'Món ăn',
      status: updated.statusValue.code,
      statusName: updated.statusValue.name,
    });

    return updated;
  }
}

export const orderService = new OrderService();
