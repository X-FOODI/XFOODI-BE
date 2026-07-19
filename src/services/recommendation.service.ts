import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { AIService } from './ai.service';
import { listDishes } from './dish.service';
import { ENV } from '../config/env';

const CACHE_TTL_SECONDS = 3600;
const MAX_RESULTS = 4;

export interface RecommendedDish {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  categoryName?: string | null;
  reason?: string;
  coOccurrenceCount?: number;
}

// ─── Cache helpers (best-effort; Redis lỗi không được làm hỏng luồng chính) ───
async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redisClient.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: CACHE_TTL_SECONDS });
  } catch {
    /* Redis down — bỏ qua caching */
  }
}

async function fetchDishesByIds(restaurantId: string, ids: string[]): Promise<Map<string, RecommendedDish>> {
  const dishes = await prisma.dish.findMany({
    where: { id: { in: ids }, restaurantId, isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      imageUrl: true,
      category: { select: { name: true } },
    },
  });
  const map = new Map<string, RecommendedDish>();
  for (const d of dishes) {
    map.set(d.id, {
      id: d.id,
      name: d.name,
      price: Number(d.price),
      imageUrl: d.imageUrl,
      categoryName: d.category?.name ?? null,
    });
  }
  return map;
}

/**
 * "Thường được gọi kèm" — thuần dữ liệu, không dùng AI.
 * Đếm các món đồng xuất hiện trong cùng đơn hàng với dishId.
 */
export async function getFrequentlyBoughtTogether(
  restaurantId: string,
  dishId: string
): Promise<RecommendedDish[]> {
  const cacheKey = `rec:fbt:${restaurantId}:${dishId}`;
  const cached = await cacheGet<RecommendedDish[]>(cacheKey);
  if (cached) return cached;

  // 1. Các đơn hàng (trong nhà hàng này) có chứa dishId
  const ordersWithDish = await prisma.orderDetail.findMany({
    where: { dishId, order: { restaurantId } },
    select: { orderId: true },
    distinct: ['orderId'],
  });
  const orderIds = ordersWithDish.map((o) => o.orderId);

  if (orderIds.length === 0) {
    await cacheSet(cacheKey, []);
    return [];
  }

  // 2. Đếm các món khác đồng xuất hiện trong các đơn đó
  const grouped = await prisma.orderDetail.groupBy({
    by: ['dishId'],
    where: {
      orderId: { in: orderIds },
      dishId: { not: null, notIn: [dishId] },
    },
    _count: { orderId: true },
    orderBy: { _count: { orderId: 'desc' } },
    take: MAX_RESULTS,
  });

  const ids = grouped.map((g) => g.dishId!).filter(Boolean);
  const dishMap = await fetchDishesByIds(restaurantId, ids);

  const result: RecommendedDish[] = [];
  for (const g of grouped) {
    const dish = g.dishId ? dishMap.get(g.dishId) : undefined;
    if (dish) result.push({ ...dish, coOccurrenceCount: g._count.orderId });
  }

  await cacheSet(cacheKey, result);
  return result;
}

/** Fallback: top món bán chạy nhất theo lượt đặt. */
async function getTopSellingDishes(restaurantId: string): Promise<RecommendedDish[]> {
  const grouped = await prisma.orderDetail.groupBy({
    by: ['dishId'],
    where: { dishId: { not: null }, order: { restaurantId } },
    _count: { orderId: true },
    orderBy: { _count: { orderId: 'desc' } },
    take: MAX_RESULTS,
  });
  const ids = grouped.map((g) => g.dishId!).filter(Boolean);
  const dishMap = await fetchDishesByIds(restaurantId, ids);
  return ids.map((id) => dishMap.get(id)).filter((d): d is RecommendedDish => !!d);
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Gợi ý món dựa trên giỏ hàng hiện tại, dùng Gemini.
 * Có fallback data-driven để không bao giờ trả về rỗng khi có lịch sử đơn.
 */
export async function getAIRecommendations(
  restaurantId: string,
  cartDishIds: string[]
): Promise<RecommendedDish[]> {
  const sortedIds = [...cartDishIds].sort();
  const cacheKey = `rec:ai:${restaurantId}:${sortedIds.join(',')}`;
  const cached = await cacheGet<RecommendedDish[]>(cacheKey);
  if (cached) return cached;

  const fallback = async (): Promise<RecommendedDish[]> => {
    if (cartDishIds.length > 0) {
      const fbt = await getFrequentlyBoughtTogether(restaurantId, cartDishIds[0]);
      if (fbt.length > 0) return fbt;
    }
    return getTopSellingDishes(restaurantId);
  };

  try {
    const menu = await listDishes(restaurantId, { limit: '100', status: 'active' } as any);
    const dishes = menu.data;
    if (dishes.length === 0) return [];

    const validIds = new Set(dishes.map((d) => d.id));
    const cartNames = cartDishIds
      .map((id) => dishes.find((d) => d.id === id)?.name)
      .filter(Boolean);

    const menuLines = dishes
      .map((d) => `- id=${d.id} | ${d.name} | ${Number(d.price).toLocaleString('vi-VN')}đ | ${d.category?.name ?? 'Khác'}`)
      .join('\n');

    const prompt = `Bạn là trợ lý gợi ý món ăn cho một nhà hàng.
Thực đơn hiện có:
${menuLines}

Khách đang có trong giỏ: ${cartNames.length > 0 ? cartNames.join(', ') : '(giỏ trống)'}.

Hãy gợi ý tối đa ${MAX_RESULTS} món phù hợp để ăn kèm hoặc gọi thêm (KHÔNG trùng món đã có trong giỏ).
Chỉ trả về JSON hợp lệ, KHÔNG kèm giải thích, đúng định dạng:
[{"dishId":"<id trong thực đơn>","reason":"lý do ngắn tối đa 12 từ"}]`;

    const response = await AIService.generateContent({
      model: ENV.AI.DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0.7 },
    });

    const text = (response as any)?.text;
    if (!text) return await fallback();

    const parsed = JSON.parse(stripJsonFences(text)) as Array<{ dishId?: string; reason?: string }>;
    if (!Array.isArray(parsed)) return await fallback();

    const cartSet = new Set(cartDishIds);
    const wantedIds = parsed
      .map((p) => p.dishId)
      .filter((id): id is string => !!id && validIds.has(id) && !cartSet.has(id))
      .slice(0, MAX_RESULTS);

    if (wantedIds.length === 0) return await fallback();

    const dishMap = await fetchDishesByIds(restaurantId, wantedIds);
    const result: RecommendedDish[] = [];
    for (const p of parsed) {
      if (!p.dishId) continue;
      const dish = dishMap.get(p.dishId);
      if (dish && !result.find((r) => r.id === dish.id)) {
        result.push({ ...dish, reason: p.reason });
      }
    }

    const finalResult = result.length > 0 ? result : await fallback();
    await cacheSet(cacheKey, finalResult);
    return finalResult;
  } catch (err: any) {
    console.warn('[Recommendation] AI recommendation failed, using fallback:', err?.message);
    return await fallback();
  }
}
