import { Router } from 'express';
import { getDailyInsight } from '../../services/insight.service';
import type { Router as ExpressRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from './auth';

const router: ExpressRouter = Router();

// Helper to get date ranges
function getDateRanges(filter: string) {
  const now = new Date();
  const fromDate = new Date();
  const prevFromDate = new Date();
  const prevToDate = new Date();

  if (filter === 'day') {
    fromDate.setHours(0, 0, 0, 0);
    prevFromDate.setDate(prevFromDate.getDate() - 1);
    prevFromDate.setHours(0, 0, 0, 0);
    prevToDate.setDate(prevToDate.getDate() - 1);
    prevToDate.setHours(23, 59, 59, 999);
  } else if (filter === 'week') {
    fromDate.setDate(now.getDate() - 7);
    prevFromDate.setDate(now.getDate() - 14);
    prevToDate.setDate(now.getDate() - 7);
  } else if (filter === 'month') {
    fromDate.setMonth(now.getMonth() - 1);
    prevFromDate.setMonth(now.getMonth() - 2);
    prevToDate.setMonth(now.getMonth() - 1);
  } else {
    // year
    fromDate.setFullYear(now.getFullYear() - 1);
    prevFromDate.setFullYear(now.getFullYear() - 2);
    prevToDate.setFullYear(now.getFullYear() - 1);
  }

  return {
    now,
    fromDate,
    toDate: now,
    prevFromDate,
    prevToDate
  };
}

// Helper to calculate percentage change
function getChangePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// Helper to resolve completed and active statuses
async function getStatusIds() {
  const statusTypes = await prisma.statusType.findMany({
    where: { code: { in: ['ORDER', 'RESERVATION'] } },
    include: { statusValues: true }
  });

  const orderType = statusTypes.find(t => t.code === 'ORDER');
  const reservationType = statusTypes.find(t => t.code === 'RESERVATION');

  return {
    orderCompletedId: orderType?.statusValues.find(v => v.code === 'COMPLETED')?.id || '',
    orderPendingId: orderType?.statusValues.find(v => v.code === 'PENDING')?.id || '',
    orderConfirmedId: orderType?.statusValues.find(v => v.code === 'CONFIRMED')?.id || '',
    resPendingId: reservationType?.statusValues.find(v => v.code === 'PENDING')?.id || '',
  };
}

// ─── TENANT DASHBOARD ENDPOINTS ───────────────────────────────────────────────

router.get('/restaurant/ai-insight', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    const data = await getDailyInsight(restaurantId);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[Dashboard] ai-insight error:', err?.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi tạo báo cáo AI' });
  }
});

router.get('/restaurant/summary', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const filter = (req.query.filter as string) || 'week';
    const { fromDate, toDate, prevFromDate, prevToDate } = getDateRanges(filter);
    const { orderCompletedId, orderPendingId, orderConfirmedId, resPendingId } = await getStatusIds();

    // Current period metrics
    const currentOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: fromDate, lte: toDate }
      }
    });

    const currentReservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        time: { gte: fromDate, lte: toDate }
      }
    });

    // Previous period metrics
    const prevOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: prevFromDate, lte: prevToDate }
      }
    });

    // Calculations
    const currentCompleted = currentOrders.filter(o => o.orderStatusId === orderCompletedId);
    const currentRevenue = currentCompleted.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    const prevCompleted = prevOrders.filter(o => o.orderStatusId === orderCompletedId);
    const prevRevenue = prevCompleted.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    const liveProcessing = currentOrders.filter(
      o => o.orderStatusId === orderPendingId || o.orderStatusId === orderConfirmedId
    ).length;

    const pendingReservations = currentReservations.filter(
      r => r.reservationStatusId === resPendingId
    ).length;

    // Unique customers current vs prev
    const currentCustomerIds = new Set(currentOrders.map(o => o.customerId).filter(Boolean));
    const prevCustomerIds = new Set(prevOrders.map(o => o.customerId).filter(Boolean));

    const revenueChange = getChangePercent(currentRevenue, prevRevenue);
    const customersChange = getChangePercent(currentCustomerIds.size, prevCustomerIds.size);

    return res.json({
      success: true,
      data: {
        revenue: { total: currentRevenue, changePercent: revenueChange },
        orders: { total: currentOrders.length, completed: currentCompleted.length, liveProcessing },
        reservations: { total: currentReservations.length, pending: pendingReservations },
        newCustomers: { total: currentCustomerIds.size, changePercent: customersChange },
        fromDate,
        toDate
      }
    });
  } catch (err) {
    console.error('[DashboardAPI] /restaurant/summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/restaurant/trends', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const filter = (req.query.filter as string) || 'week';
    const { fromDate, toDate } = getDateRanges(filter);
    const { orderCompletedId } = await getStatusIds();

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: fromDate, lte: toDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Build trend datasets
    const revenueMap: Record<string, number> = {};
    const orderMap: Record<string, number> = {};

    // Initialize map keys based on filters
    const daysToShow = filter === 'day' ? 12 : filter === 'week' ? 7 : filter === 'month' ? 30 : 12;
    const labels: string[] = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      if (filter === 'day') {
        d.setHours(d.getHours() - i * 2);
        const label = `${d.getHours()}h`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      } else if (filter === 'week') {
        d.setDate(d.getDate() - i);
        const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      } else if (filter === 'month') {
        d.setDate(d.getDate() - i);
        const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      } else {
        d.setMonth(d.getMonth() - i);
        const label = `Th${d.getMonth() + 1}`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      }
    }

    orders.forEach(o => {
      const date = new Date(o.createdAt);
      let label = '';
      if (filter === 'day') {
        const hourGroup = Math.floor(date.getHours() / 2) * 2;
        label = `${hourGroup}h`;
      } else if (filter === 'week' || filter === 'month') {
        label = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      } else {
        label = `Th${date.getMonth() + 1}`;
      }

      if (label in orderMap) {
        orderMap[label]++;
        if (o.orderStatusId === orderCompletedId) {
          revenueMap[label] += Number(o.totalAmount);
        }
      }
    });

    const revenueTrend = labels.map(l => ({ label: l, value: revenueMap[l], date: l }));
    const orderTrend = labels.map(l => ({ label: l, total: orderMap[l], date: l }));

    return res.json({
      success: true,
      data: {
        revenueTrend,
        orderTrend
      }
    });
  } catch (err) {
    console.error('[DashboardAPI] /restaurant/trends error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/restaurant/top-dishes', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const { orderCompletedId } = await getStatusIds();

    const orderDetails = await prisma.orderDetail.findMany({
      where: {
        order: {
          restaurantId,
          orderStatusId: orderCompletedId
        }
      },
      include: {
        dish: true
      }
    });

    const dishStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
    orderDetails.forEach(od => {
      if (!od.dish) return;
      const id = od.dish.id;
      if (!dishStats[id]) {
        dishStats[id] = { name: od.dish.name, quantity: 0, revenue: 0 };
      }
      dishStats[id].quantity += od.quantity;
      dishStats[id].revenue += od.quantity * Number(od.unitPrice);
    });

    const sortedDishes = Object.entries(dishStats)
      .map(([id, stats]) => ({ dishId: id, ...stats }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return res.json({
      success: true,
      data: sortedDishes
    });
  } catch (err) {
    console.error('[DashboardAPI] /restaurant/top-dishes error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/restaurant/latest-feedbacks', authMiddleware, async (req: any, res: any) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Missing restaurantId in token' });
    }

    const feedbacks = await prisma.feedback.findMany({
      where: {
        order: { restaurantId }
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: {
        customer: {
          include: {
            user: {
              select: { fullName: true, avatarUrl: true }
            }
          }
        }
      }
    });

    const allFeedbacks = await prisma.feedback.findMany({
      where: {
        order: { restaurantId }
      },
      select: { rating: true }
    });

    const totalCount = allFeedbacks.length;
    const averageRating = totalCount > 0 
      ? allFeedbacks.reduce((sum, f) => sum + f.rating, 0) / totalCount 
      : 0;

    const formattedItems = feedbacks.map(f => ({
      id: f.id,
      customerName: f.isAnonymous ? undefined : (f.customer?.user?.fullName || 'Khách hàng'),
      isAnonymous: f.isAnonymous,
      avatarUrl: f.isAnonymous ? undefined : (f.customer?.user?.avatarUrl || ''),
      rating: f.rating,
      comment: f.comment || '',
      createdDate: f.createdAt.toISOString()
    }));

    return res.json({
      success: true,
      data: {
        items: formattedItems,
        totalCount,
        averageRating
      }
    });
  } catch (err) {
    console.error('[DashboardAPI] /restaurant/latest-feedbacks error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN DASHBOARD ENDPOINTS ───────────────────────────────────────────────

router.get('/admin/summary', authMiddleware, async (req: any, res: any) => {
  try {
    const roles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    if (!roles.includes('Admin') && !roles.includes('SuperAdmin') && !roles.includes('System Admin')) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const filter = (req.query.filter as string) || 'week';
    const { fromDate, toDate, prevFromDate, prevToDate } = getDateRanges(filter);
    const { orderCompletedId } = await getStatusIds();

    // Platforms stats are calculated across the host/central database
    const totalRestaurantsCount = await prisma.restaurant.count();
    const activeRestaurantsCount = await prisma.restaurant.count({ where: { isActive: true } });

    // Orders Platform Wide
    const currentOrders = await prisma.order.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } }
    });

    const prevOrders = await prisma.order.findMany({
      where: { createdAt: { gte: prevFromDate, lte: prevToDate } }
    });

    const currentCompleted = currentOrders.filter(o => o.orderStatusId === orderCompletedId);
    const currentRevenue = currentCompleted.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    const prevCompleted = prevOrders.filter(o => o.orderStatusId === orderCompletedId);
    const prevRevenue = prevCompleted.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    // Users Platform Wide
    const totalUsersCount = await prisma.user.count();
    
    // Users registered this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usersNewThisMonth = await prisma.user.count({
      where: { createdAt: { gte: startOfMonth } }
    });
    const restaurantsNewThisMonth = await prisma.restaurant.count({
      where: { createdAt: { gte: startOfMonth } }
    });

    const revenueChange = getChangePercent(currentRevenue, prevRevenue);
    const ordersChange = getChangePercent(currentOrders.length, prevOrders.length);
    const usersChange = getChangePercent(totalUsersCount, totalUsersCount - usersNewThisMonth);
    const restaurantsChange = getChangePercent(totalRestaurantsCount, totalRestaurantsCount - restaurantsNewThisMonth);

    return res.json({
      success: true,
      data: {
        totalRestaurants: { total: totalRestaurantsCount, changePercent: restaurantsChange, active: activeRestaurantsCount },
        totalRevenue: { total: currentRevenue, changePercent: revenueChange },
        totalOrders: { total: currentOrders.length, changePercent: ordersChange },
        totalUsers: { total: totalUsersCount, changePercent: usersChange, newThisMonth: usersNewThisMonth },
        fromDate,
        toDate
      }
    });
  } catch (err) {
    console.error('[DashboardAPI] /admin/summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/admin/trends', authMiddleware, async (req: any, res: any) => {
  try {
    const roles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    if (!roles.includes('Admin') && !roles.includes('SuperAdmin') && !roles.includes('System Admin')) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const filter = (req.query.filter as string) || 'week';
    const { fromDate, toDate } = getDateRanges(filter);
    const { orderCompletedId } = await getStatusIds();

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      orderBy: { createdAt: 'asc' }
    });

    const revenueMap: Record<string, number> = {};
    const orderMap: Record<string, number> = {};
    const labels: string[] = [];

    const daysToShow = filter === 'day' ? 12 : filter === 'week' ? 7 : filter === 'month' ? 30 : 12;
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      if (filter === 'day') {
        d.setHours(d.getHours() - i * 2);
        const label = `${d.getHours()}h`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      } else if (filter === 'week') {
        d.setDate(d.getDate() - i);
        const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      } else if (filter === 'month') {
        d.setDate(d.getDate() - i);
        const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      } else {
        d.setMonth(d.getMonth() - i);
        const label = `Th${d.getMonth() + 1}`;
        labels.push(label);
        revenueMap[label] = 0;
        orderMap[label] = 0;
      }
    }

    orders.forEach(o => {
      const date = new Date(o.createdAt);
      let label = '';
      if (filter === 'day') {
        const hourGroup = Math.floor(date.getHours() / 2) * 2;
        label = `${hourGroup}h`;
      } else if (filter === 'week' || filter === 'month') {
        label = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      } else {
        label = `Th${date.getMonth() + 1}`;
      }

      if (label in orderMap) {
        orderMap[label]++;
        if (o.orderStatusId === orderCompletedId) {
          revenueMap[label] += Number(o.totalAmount);
        }
      }
    });

    const revenueTrend = labels.map(l => ({ label: l, value: revenueMap[l], date: l }));
    const orderTrend = labels.map(l => ({ label: l, total: orderMap[l], date: l }));

    return res.json({
      success: true,
      data: {
        revenueTrend,
        orderTrend
      }
    });
  } catch (err) {
    console.error('[DashboardAPI] /admin/trends error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/admin/top-restaurants', authMiddleware, async (req: any, res: any) => {
  try {
    const roles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    if (!roles.includes('Admin') && !roles.includes('SuperAdmin') && !roles.includes('System Admin')) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { orderCompletedId } = await getStatusIds();

    const completedOrders = await prisma.order.findMany({
      where: { orderStatusId: orderCompletedId },
      select: { restaurantId: true, totalAmount: true }
    });

    const restRevenue: Record<string, number> = {};
    completedOrders.forEach(o => {
      if (!o.restaurantId) return;
      restRevenue[o.restaurantId] = (restRevenue[o.restaurantId] || 0) + Number(o.totalAmount);
    });

    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: Object.keys(restRevenue) } },
      select: { id: true, name: true, slug: true, isActive: true }
    });

    const list = restaurants.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      revenue: restRevenue[r.id] || 0,
      status: r.isActive ? 'active' : 'inactive',
      rating: 4.8, // Fallback rating
      orders: completedOrders.filter(o => o.restaurantId === r.id).length
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return res.json({
      success: true,
      data: list
    });
  } catch (err) {
    console.error('[DashboardAPI] /admin/top-restaurants error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
