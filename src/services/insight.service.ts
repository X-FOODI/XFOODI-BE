import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { AIService } from './ai.service';
import { ENV } from '../config/env';
import { getLowStockIngredients } from './inventory.service';

export interface DailyInsight {
  summary: string;
  suggestions: string[];
  anomaly: string | null;
  metrics: {
    todayOrders: number;
    todayRevenue: number;
    yesterdayRevenue: number;
    revenueChangePercent: number;
    topDish: string | null;
    lowStockCount: number;
  };
}

function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

async function completedStatusId(): Promise<string | null> {
  const sv = await prisma.statusValue.findFirst({
    where: { code: 'COMPLETED', statusType: { code: 'ORDER' } },
    select: { id: true },
  });
  return sv?.id ?? null;
}

/** Báo cáo AI hằng ngày cho chủ nhà hàng (cache theo ngày, best-effort). */
export async function getDailyInsight(restaurantId: string): Promise<DailyInsight> {
  const dayKey = startOfDay().toISOString().slice(0, 10);
  const cacheKey = `insight:${restaurantId}:${dayKey}`;
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    /* redis down */
  }

  const today = startOfDay();
  const yStart = startOfDay(1);
  const completedId = await completedStatusId();

  const [todayOrdersList, yesterdayOrdersList] = await Promise.all([
    prisma.order.findMany({ where: { restaurantId, createdAt: { gte: today } }, select: { id: true, totalAmount: true, orderStatusId: true } }),
    prisma.order.findMany({ where: { restaurantId, createdAt: { gte: yStart, lt: today } }, select: { totalAmount: true, orderStatusId: true } }),
  ]);

  const todayRevenue = todayOrdersList.filter((o) => o.orderStatusId === completedId).reduce((s, o) => s + Number(o.totalAmount), 0);
  const yesterdayRevenue = yesterdayOrdersList.filter((o) => o.orderStatusId === completedId).reduce((s, o) => s + Number(o.totalAmount), 0);
  const revenueChangePercent = yesterdayRevenue > 0 ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : 0;

  // Món bán chạy nhất hôm nay
  const todayOrderIds = todayOrdersList.map((o) => o.id);
  let topDish: string | null = null;
  if (todayOrderIds.length > 0) {
    const grouped = await prisma.orderDetail.groupBy({
      by: ['dishId'],
      where: { orderId: { in: todayOrderIds }, dishId: { not: null } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 1,
    });
    if (grouped[0]?.dishId) {
      const dish = await prisma.dish.findUnique({ where: { id: grouped[0].dishId }, select: { name: true } });
      topDish = dish?.name ?? null;
    }
  }

  // Nguyên liệu sắp hết → gợi ý nhập kho (best-effort)
  let lowStock: { name: string; unit: string; currentQuantity: number; minStockLevel: number }[] = [];
  try {
    lowStock = await getLowStockIngredients(restaurantId);
  } catch {
    /* bỏ qua */
  }

  // Phát hiện bất thường: doanh thu sụt mạnh so với hôm qua
  const anomaly =
    yesterdayRevenue > 0 && revenueChangePercent <= -30
      ? `Doanh thu hôm nay giảm mạnh ${Math.abs(revenueChangePercent)}% so với hôm qua — cần rà soát nguyên nhân.`
      : null;

  const metrics = {
    todayOrders: todayOrdersList.length,
    todayRevenue,
    yesterdayRevenue,
    revenueChangePercent,
    topDish,
    lowStockCount: lowStock.length,
  };

  // Fallback không AI
  const fallback = (): DailyInsight => ({
    summary: `Hôm nay có ${metrics.todayOrders} đơn, doanh thu ${todayRevenue.toLocaleString('vi-VN')}đ (${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent}% so với hôm qua).${topDish ? ` Món bán chạy nhất: ${topDish}.` : ''}`,
    suggestions: [
      lowStock.length > 0
        ? `Nhập thêm nguyên liệu sắp hết: ${lowStock.slice(0, 3).map((l) => l.name).join(', ')}.`
        : 'Kiểm tra tồn kho các món bán chạy để tránh hết hàng.',
      'Xem lại khung giờ cao điểm để bố trí nhân sự hợp lý.',
    ],
    anomaly,
    metrics,
  });

  try {
    const prompt = `Bạn là cố vấn kinh doanh nhà hàng. Dựa trên số liệu HÔM NAY:
- Số đơn: ${metrics.todayOrders}
- Doanh thu hoàn thành: ${todayRevenue.toLocaleString('vi-VN')}đ
- Doanh thu hôm qua: ${yesterdayRevenue.toLocaleString('vi-VN')}đ (thay đổi ${revenueChangePercent}%)
- Món bán chạy nhất: ${topDish ?? 'chưa có'}
- Nguyên liệu sắp hết: ${lowStock.length > 0 ? lowStock.slice(0, 5).map((l) => l.name).join(', ') : 'không có'}
${anomaly ? `- CẢNH BÁO: ${anomaly}` : ''}

Hãy trả về JSON: {"summary":"nhận xét ngắn ≤40 từ, tiếng Việt","suggestions":["2-3 gợi ý hành động cụ thể (ưu tiên nhập kho nếu có nguyên liệu sắp hết), mỗi cái ≤20 từ"]}`;

    const response = await AIService.generateContent({
      model: ENV.AI.DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0.6 },
    });
    const text = (response as any)?.text;
    if (!text) return fallback();

    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')) as { summary?: string; suggestions?: string[] };
    const result: DailyInsight = {
      summary: parsed.summary || fallback().summary,
      suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0 ? parsed.suggestions.slice(0, 3) : fallback().suggestions,
      anomaly,
      metrics,
    };
    try {
      await redisClient.set(cacheKey, JSON.stringify(result), { EX: 3600 });
    } catch {
      /* redis down */
    }
    return result;
  } catch (err: any) {
    console.warn('[Insight] AI insight failed, fallback:', err?.message);
    return fallback();
  }
}
