import { prisma } from '../lib/prisma';
import { getIO } from '../socket';

export interface LowStockItem {
  id: string;
  name: string;
  unit: string;
  currentQuantity: number;
  minStockLevel: number;
}

function stockError(message: string): Error {
  const e: any = new Error(message);
  e.statusCode = 409;
  return e;
}

/**
 * ĐẶT-GIỮ (reserve) nguyên liệu NGAY khi tạo đơn — chống oversell.
 * Chạy TRONG transaction (tx) của createOrder. Với mỗi nguyên liệu cần dùng:
 *   UPDATE ... SET qty = qty - need WHERE qty >= need   (atomic, có điều kiện)
 * Nếu count = 0 → không đủ → throw → rollback cả đơn.
 * Người chạy câu UPDATE thành công ĐẦU TIÊN là người thắng "món cuối".
 * Trả về danh sách ingredientId đã trừ (để cảnh báo tồn thấp sau khi commit).
 */
export async function reserveStockForItems(
  tx: any,
  items: Array<{ dishId: string; quantity: number }>,
): Promise<string[]> {
  const dishIds = [...new Set(items.map((i) => i.dishId))];
  const recipes = await tx.dishRecipe.findMany({
    where: { dishId: { in: dishIds } },
    select: { dishId: true, ingredientId: true, quantity: true },
  });
  if (recipes.length === 0) return [];

  const needed = new Map<string, number>();
  for (const it of items) {
    for (const r of recipes) {
      if (r.dishId !== it.dishId) continue;
      needed.set(r.ingredientId, (needed.get(r.ingredientId) || 0) + Number(r.quantity) * it.quantity);
    }
  }

  const affected: string[] = [];
  for (const [ingredientId, need] of needed) {
    // Chỉ reserve nếu nhà hàng có theo dõi tồn kho cho nguyên liệu này
    const stock = await tx.inventoryStock.findUnique({ where: { ingredientId }, select: { id: true } });
    if (!stock) continue;

    // Atomic có điều kiện: chỉ trừ khi còn đủ. count=0 nghĩa là hết hàng.
    const res = await tx.inventoryStock.updateMany({
      where: { ingredientId, currentQuantity: { gte: need } },
      data: { currentQuantity: { decrement: need }, lastUpdated: new Date() },
    });
    if (res.count === 0) {
      const ing = await tx.ingredient.findUnique({ where: { id: ingredientId }, select: { name: true } });
      throw stockError(`Nguyên liệu "${ing?.name || 'không rõ'}" đã hết — không thể đặt món này.`);
    }

    await tx.stockTransaction.create({
      data: { ingredientId, transactionType: 'RESERVE', quantity: need, unitPrice: 0, totalAmount: 0, reference: 'ORDER_RESERVE' },
    });
    affected.push(ingredientId);
  }
  return affected;
}

/** Sau khi commit đơn: kiểm tra tồn thấp, tự tắt món hết nguyên liệu, phát cảnh báo. */
export async function checkAndAlertLowStock(restaurantId: string, ingredientIds: string[]): Promise<void> {
  if (ingredientIds.length === 0) return;
  const lowStock: LowStockItem[] = [];
  const outOfStockIds: string[] = [];

  for (const ingredientId of ingredientIds) {
    const ing = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      include: { inventoryStock: true },
    });
    if (!ing || !ing.inventoryStock) continue;
    const cur = Number(ing.inventoryStock.currentQuantity);
    const min = Number(ing.minStockLevel);
    if (cur <= 0) outOfStockIds.push(ingredientId);
    if (cur <= min) lowStock.push({ id: ing.id, name: ing.name, unit: ing.unit, currentQuantity: cur, minStockLevel: min });
  }

  let disabledDishIds: string[] = [];
  if (outOfStockIds.length > 0) {
    const affected = await prisma.dishRecipe.findMany({ where: { ingredientId: { in: outOfStockIds } }, select: { dishId: true } });
    disabledDishIds = [...new Set(affected.map((a) => a.dishId))];
    if (disabledDishIds.length > 0) {
      await prisma.dish.updateMany({ where: { id: { in: disabledDishIds }, restaurantId, isActive: true }, data: { isActive: false } });
    }
  }

  if (lowStock.length > 0 || disabledDishIds.length > 0) {
    try {
      getIO().to(`restaurant_${restaurantId}`).emit('LOW_STOCK_ALERT', { lowStock, disabledDishIds });
    } catch {
      /* socket chưa init */
    }
  }
}

/** Hoàn (release) nguyên liệu đã giữ khi đơn bị HỦY. */
export async function releaseStockForOrder(orderId: string): Promise<void> {
  const details = await prisma.orderDetail.findMany({
    where: { orderId, dishId: { not: null } },
    select: { dishId: true, quantity: true },
  });
  if (details.length === 0) return;

  const dishIds = [...new Set(details.map((d) => d.dishId!))];
  const recipes = await prisma.dishRecipe.findMany({ where: { dishId: { in: dishIds } }, select: { dishId: true, ingredientId: true, quantity: true } });
  if (recipes.length === 0) return;

  const back = new Map<string, number>();
  for (const d of details) {
    for (const r of recipes) {
      if (r.dishId !== d.dishId) continue;
      back.set(r.ingredientId, (back.get(r.ingredientId) || 0) + Number(r.quantity) * d.quantity);
    }
  }

  for (const [ingredientId, qty] of back) {
    const stock = await prisma.inventoryStock.findUnique({ where: { ingredientId }, select: { id: true } });
    if (!stock) continue;
    await prisma.inventoryStock.update({ where: { ingredientId }, data: { currentQuantity: { increment: qty }, lastUpdated: new Date() } });
    await prisma.stockTransaction.create({
      data: { ingredientId, transactionType: 'RELEASE', quantity: qty, unitPrice: 0, totalAmount: 0, reference: `ORDER_CANCEL:${orderId}` },
    });
  }
}

/** Danh sách nguyên liệu dưới ngưỡng tồn kho tối thiểu (cho dashboard). */
export async function getLowStockIngredients(restaurantId: string): Promise<LowStockItem[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, isActive: true, inventoryStock: { isNot: null } },
    include: { inventoryStock: true },
  });
  return ingredients
    .filter((i) => i.inventoryStock && Number(i.inventoryStock.currentQuantity) <= Number(i.minStockLevel))
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      currentQuantity: Number(i.inventoryStock!.currentQuantity),
      minStockLevel: Number(i.minStockLevel),
    }));
}
