import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import type {
  CreateDishBody,
  UpdateDishBody,
  DishQuery,
  DishResponse,
  PaginatedDishes,
} from '../types/dish.types';

// ─── Custom Exception ──────────────────────────────────────────────────────────

export class DishServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'DishServiceError';
    Object.setPrototypeOf(this, DishServiceError.prototype);
  }
}

// ─── Select Projection ─────────────────────────────────────────────────────────

const DISH_SELECT = {
  id: true,
  categoryId: true,
  restaurantId: true,
  name: true,
  description: true,
  price: true,
  unit: true,
  imageUrl: true,
  isVegetarian: true,
  isSpicy: true,
  isBestSeller: true,
  isActive: true,
  autoDisableByStock: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: { id: true, name: true },
  },
} as const;

// ─── Helper ────────────────────────────────────────────────────────────────────

function toDishResponse(d: any): DishResponse {
  return {
    id: d.id,
    categoryId: d.categoryId,
    restaurantId: d.restaurantId,
    name: d.name,
    description: d.description,
    price: d.price instanceof Decimal ? d.price.toFixed(2) : String(d.price),
    unit: d.unit,
    imageUrl: d.imageUrl,
    isVegetarian: d.isVegetarian,
    isSpicy: d.isSpicy,
    isBestSeller: d.isBestSeller,
    isActive: d.isActive,
    autoDisableByStock: d.autoDisableByStock,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    category: d.category,
  };
}

// ─── Service Functions ─────────────────────────────────────────────────────────

/**
 * Create a new dish under a restaurant.
 * Business rules:
 *   - Category must belong to the same restaurant
 *   - Name must be unique within the same category
 *   - Price must be >= 0
 */
export async function createDish(
  restaurantId: string,
  body: CreateDishBody
): Promise<DishResponse> {
  // 1. Validate category belongs to the restaurant
  const category = await prisma.category.findFirst({
    where: { id: body.categoryId, restaurantId },
    select: { id: true },
  });
  if (!category) {
    throw new DishServiceError(404, 'Category not found or does not belong to this restaurant');
  }

  // 2. Name uniqueness within the same category
  const duplicate = await prisma.dish.findFirst({
    where: {
      restaurantId,
      categoryId: body.categoryId,
      name: { equals: body.name.trim(), mode: 'insensitive' },
    },
  });
  if (duplicate) {
    throw new DishServiceError(
      409,
      `A dish named "${body.name.trim()}" already exists in this category`
    );
  }

  // 3. Price validation
  const priceNum = Number(body.price);
  if (isNaN(priceNum) || priceNum < 0) {
    throw new DishServiceError(400, 'Price must be a non-negative number');
  }

  const dish = await prisma.dish.create({
    data: {
      restaurantId,
      categoryId: body.categoryId,
      name: body.name.trim(),
      description: body.description.trim(),
      price: new Decimal(priceNum),
      unit: body.unit.trim(),
      imageUrl: body.imageUrl || null,
      isVegetarian: body.isVegetarian ?? false,
      isSpicy: body.isSpicy ?? false,
      isBestSeller: body.isBestSeller ?? false,
      isActive: body.isActive ?? true,
      autoDisableByStock: body.autoDisableByStock ?? false,
    },
    select: DISH_SELECT,
  });

  return toDishResponse(dish);
}

/**
 * List dishes with multi-field filters and pagination.
 */
export async function listDishes(
  restaurantId: string,
  query: DishQuery
): Promise<PaginatedDishes> {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.max(1, parseInt(query.limit as string) || 10);
  const skip = (page - 1) * limit;

  const where: any = { restaurantId };

  if (query.search) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { description: { contains: s, mode: 'insensitive' } },
    ];
  }

  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }

  if (query.status === 'active') where.isActive = true;
  else if (query.status === 'inactive') where.isActive = false;

  if (query.isVegetarian === 'true') where.isVegetarian = true;
  if (query.isSpicy === 'true') where.isSpicy = true;
  if (query.isBestSeller === 'true') where.isBestSeller = true;

  const [total, records] = await Promise.all([
    prisma.dish.count({ where }),
    prisma.dish.findMany({
      where,
      select: DISH_SELECT,
      orderBy: [{ name: 'asc' }],
      skip,
      take: limit,
    }),
  ]);

  return { data: records.map(toDishResponse), total, page, limit };
}

/**
 * Get dish detail by id (tenant-scoped).
 */
export async function getDishDetail(
  restaurantId: string,
  id: string
): Promise<DishResponse> {
  const dish = await prisma.dish.findFirst({
    where: { id, restaurantId },
    select: DISH_SELECT,
  });
  if (!dish) {
    throw new DishServiceError(404, 'Dish not found');
  }
  return toDishResponse(dish);
}

/**
 * Update a dish.
 * - If categoryId changes, validate it belongs to the same restaurant.
 * - If name changes, check uniqueness within the target category.
 */
export async function updateDish(
  restaurantId: string,
  id: string,
  body: UpdateDishBody
): Promise<DishResponse> {
  const existing = await prisma.dish.findFirst({
    where: { id, restaurantId },
    select: { id: true, name: true, categoryId: true },
  });
  if (!existing) {
    throw new DishServiceError(404, 'Dish not found');
  }

  const updateData: any = {};
  const targetCategoryId = body.categoryId ?? existing.categoryId;

  // Category validation
  if (body.categoryId && body.categoryId !== existing.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: body.categoryId, restaurantId },
    });
    if (!cat) {
      throw new DishServiceError(404, 'Target category not found or belongs to different restaurant');
    }
    updateData.categoryId = body.categoryId;
  }

  // Name uniqueness
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await prisma.dish.findFirst({
        where: {
          restaurantId,
          categoryId: targetCategoryId,
          name: { equals: trimmed, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (dup) {
        throw new DishServiceError(409, `A dish named "${trimmed}" already exists in this category`);
      }
    }
    updateData.name = trimmed;
  }

  if (body.description !== undefined) updateData.description = body.description.trim();
  if (body.price !== undefined) {
    const priceNum = Number(body.price);
    if (isNaN(priceNum) || priceNum < 0) {
      throw new DishServiceError(400, 'Price must be a non-negative number');
    }
    updateData.price = new Decimal(priceNum);
  }
  if (body.unit !== undefined) updateData.unit = body.unit.trim();
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
  if (body.isVegetarian !== undefined) updateData.isVegetarian = body.isVegetarian;
  if (body.isSpicy !== undefined) updateData.isSpicy = body.isSpicy;
  if (body.isBestSeller !== undefined) updateData.isBestSeller = body.isBestSeller;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.autoDisableByStock !== undefined) updateData.autoDisableByStock = body.autoDisableByStock;

  const updated = await prisma.dish.update({
    where: { id },
    data: updateData,
    select: DISH_SELECT,
  });

  return toDishResponse(updated);
}

/**
 * Safe delete: block if dish exists in any active order.
 */
export async function deleteDish(restaurantId: string, id: string): Promise<void> {
  const existing = await prisma.dish.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  });
  if (!existing) {
    throw new DishServiceError(404, 'Dish not found');
  }

  // Check active orders referencing this dish
  const activeOrderCount = await prisma.orderDetail.count({
    where: {
      dishId: id,
      order: {
        completedAt: null,
        cancelledAt: null,
      },
    },
  });

  if (activeOrderCount > 0) {
    throw new DishServiceError(
      400,
      `Cannot delete dish: it is referenced in ${activeOrderCount} active order(s). ` +
      `Please wait for orders to complete or deactivate the dish instead.`
    );
  }

  await prisma.dish.delete({ where: { id } });
}
