import { prisma } from '../lib/prisma';
import { getIO } from '../socket';

export interface LowStockItem {
  id: string;
  name: string;
  unit: string;
  currentQuantity: number;
  minStockLevel: number;
}

/**
 * Trừ tồn kho theo công thức khi đơn hoàn thành.
 * - Với mỗi món × số lượng → trừ nguyên liệu theo DishRecipe.
 * - Ghi StockTransaction (CONSUMPTION).
 * - Nguyên liệu ≤ minStockLevel → cảnh báo; = 0 → tự tắt các món cần nó.
 * - Phát socket LOW_STOCK_ALERT tới phòng nhà hàng.
 * Best-effort: không throw ra ngoài.
 */
export async function deductStockForOrder(restaurantId: string, orderId: string): Promise<void> {
  const details = await prisma.orderDetail.findMany({
    where: { orderId, dishId: { not: null } },
    select: { dishId: true, quantity: true },
  });
  if (details.length === 0) return;

  const dishIds = [...new Set(details.map((d) => d.dishId!))];
  const recipes = await prisma.dishRecipe.findMany({
    where: { dishId: { in: dishIds } },
    select: { dishId: true, ingredientId: true, quantity: true },
  });
  if (recipes.length === 0) return;

  // Tổng nguyên liệu cần trừ
  const needed = new Map<string, number>();
  for (const d of details) {
    for (const r of recipes) {
      if (r.dishId !== d.dishId) continue;
      needed.set(r.ingredientId, (needed.get(r.ingredientId) || 0) + Number(r.quantity) * d.quantity);
    }
  }
  if (needed.size === 0) return;

  const lowStock: LowStockItem[] = [];
  const outOfStockIngredientIds: string[] = [];

  for (const [ingredientId, qty] of needed) {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      include: { inventoryStock: true },
    });
    if (!ingredient || !ingredient.inventoryStock) continue;

    const before = Number(ingredient.inventoryStock.currentQuantity);
    const after = Math.max(0, before - qty);

    await prisma.inventoryStock.update({
      where: { ingredientId },
      data: { currentQuantity: after, lastUpdated: new Date() },
    });

    await prisma.stockTransaction.create({
      data: {
        ingredientId,
        transactionType: 'CONSUMPTION',
        quantity: qty,
        unitPrice: 0,
        totalAmount: 0,
        reference: `ORDER:${orderId}`,
      },
    });

    const min = Number(ingredient.minStockLevel);
    if (after <= 0) outOfStockIngredientIds.push(ingredientId);
    if (after <= min) {
      lowStock.push({ id: ingredientId, name: ingredient.name, unit: ingredient.unit, currentQuantity: after, minStockLevel: min });
    }
  }

  // Tự tắt các món cần nguyên liệu đã hết
  let disabledDishIds: string[] = [];
  if (outOfStockIngredientIds.length > 0) {
    const affected = await prisma.dishRecipe.findMany({
      where: { ingredientId: { in: outOfStockIngredientIds } },
      select: { dishId: true },
    });
    disabledDishIds = [...new Set(affected.map((a) => a.dishId))];
    if (disabledDishIds.length > 0) {
      await prisma.dish.updateMany({
        where: { id: { in: disabledDishIds }, restaurantId, isActive: true },
        data: { isActive: false },
      });
    }
  }

  if (lowStock.length > 0 || disabledDishIds.length > 0) {
    try {
      getIO().to(`restaurant_${restaurantId}`).emit('LOW_STOCK_ALERT', { lowStock, disabledDishIds });
    } catch {
      /* socket chưa init — bỏ qua */
    }
  }
}

/** Danh sách nguyên liệu dưới ngưỡng tồn kho tối thiểu (cho dashboard cảnh báo). */
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
