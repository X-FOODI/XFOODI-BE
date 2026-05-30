import { prisma } from '../lib/prisma';
import type {
  CreateCategoryBody,
  UpdateCategoryBody,
  CategoryQuery,
  CategoryResponse,
  PaginatedCategories,
} from '../types/category.types';

// ─── Custom Exception Class ──────────────────────────────────────────────────

export class CategoryServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'CategoryServiceError';
    Object.setPrototypeOf(this, CategoryServiceError.prototype);
  }
}

// ─── Reusable Prisma Category Select ──────────────────────────────────────────

const CATEGORY_SELECT = {
  id: true,
  name: true,
  description: true,
  restaurantId: true,
  imageUrl: true,
  parentId: true,
  isActive: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  modifiedBy: true,
} as const;

// ─── Helper: Mapping DB Category to Typed Response ────────────────────────────

function toCategoryResponse(cat: any): CategoryResponse {
  return {
    id: cat.id,
    name: cat.name,
    description: cat.description,
    restaurantId: cat.restaurantId,
    imageUrl: cat.imageUrl,
    parentId: cat.parentId,
    isActive: cat.isActive,
    displayOrder: cat.displayOrder,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
    createdBy: cat.createdBy,
    modifiedBy: cat.modifiedBy,
  };
}

// ─── Service Implementation ────────────────────────────────────────────────────

/**
 * Creates a new Category under a specific restaurant.
 * Validates uniqueness of category name in the same restaurant (case-insensitive).
 */
export async function createCategory(
  restaurantId: string,
  body: CreateCategoryBody
): Promise<CategoryResponse> {
  const trimmedName = body.name.trim();

  // 1. Verify that the restaurant exists
  const restaurantExists = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true },
  });
  if (!restaurantExists) {
    throw new CategoryServiceError(404, 'Restaurant not found');
  }

  // 2. Check for name uniqueness within the same restaurant scope
  const duplicate = await prisma.category.findFirst({
    where: {
      restaurantId,
      name: {
        equals: trimmedName,
        mode: 'insensitive',
      },
    },
  });

  if (duplicate) {
    throw new CategoryServiceError(
      409,
      `A category with the name "${trimmedName}" already exists in this restaurant`
    );
  }

  // 3. If parentId is provided, verify it exists and belongs to the same restaurant
  if (body.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: body.parentId, restaurantId },
    });
    if (!parent) {
      throw new CategoryServiceError(404, 'Parent category not found or belongs to a different restaurant');
    }
  }

  // 4. Create the category
  const newCategory = await prisma.category.create({
    data: {
      name: trimmedName,
      description: body.description ? body.description.trim() : '',
      restaurantId,
      imageUrl: body.imageUrl || null,
      parentId: body.parentId || null,
      isActive: true,
      displayOrder: body.displayOrder ?? 0,
    },
    select: CATEGORY_SELECT,
  });

  return toCategoryResponse(newCategory);
}

/**
 * Lists all categories under a specific restaurant with filters, search, and pagination.
 */
export async function listCategories(
  restaurantId: string,
  query: CategoryQuery
): Promise<PaginatedCategories> {
  // Parse pagination params
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.max(1, parseInt(query.limit as string) || 10);
  const skip = (page - 1) * limit;

  // Build filter conditions
  const whereConditions: any = {
    restaurantId,
  };

  // Search filter (name or description)
  if (query.search) {
    const searchString = query.search.trim();
    whereConditions.OR = [
      { name: { contains: searchString, mode: 'insensitive' } },
      { description: { contains: searchString, mode: 'insensitive' } },
    ];
  }

  // Status filter
  if (query.status === 'active') {
    whereConditions.isActive = true;
  } else if (query.status === 'inactive') {
    whereConditions.isActive = false;
  }

  // Fetch count and records in parallel
  const [total, records] = await Promise.all([
    prisma.category.count({ where: whereConditions }),
    prisma.category.findMany({
      where: whereConditions,
      select: CATEGORY_SELECT,
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
      skip,
      take: limit,
    }),
  ]);

  return {
    data: records.map(toCategoryResponse),
    total,
    page,
    limit,
  };
}

/**
 * Gets the detailed profile of a category.
 * Throws 404 if the category is not found under this restaurant.
 */
export async function getCategoryDetail(
  restaurantId: string,
  id: string
): Promise<CategoryResponse> {
  const category = await prisma.category.findFirst({
    where: { id, restaurantId },
    select: CATEGORY_SELECT,
  });

  if (!category) {
    throw new CategoryServiceError(404, 'Category not found');
  }

  return toCategoryResponse(category);
}

/**
 * Updates a category.
 * If name changes, ensures uniqueness in the same restaurant.
 */
export async function updateCategory(
  restaurantId: string,
  id: string,
  body: UpdateCategoryBody
): Promise<CategoryResponse> {
  // 1. Check category existence
  const existing = await prisma.category.findFirst({
    where: { id, restaurantId },
    select: { id: true, name: true },
  });

  if (!existing) {
    throw new CategoryServiceError(404, 'Category not found');
  }

  const updateData: any = {};

  // 2. Uniqueness check if name is modified
  if (body.name !== undefined) {
    const trimmedName = body.name.trim();
    if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.category.findFirst({
        where: {
          restaurantId,
          id: { not: id },
          name: { equals: trimmedName, mode: 'insensitive' },
        },
      });

      if (duplicate) {
        throw new CategoryServiceError(
          409,
          `A category with the name "${trimmedName}" already exists in this restaurant`
        );
      }
    }
    updateData.name = trimmedName;
  }

  // 3. Parent scope check
  if (body.parentId !== undefined) {
    if (body.parentId === id) {
      throw new CategoryServiceError(400, 'A category cannot be its own parent');
    }
    if (body.parentId !== null) {
      const parent = await prisma.category.findFirst({
        where: { id: body.parentId, restaurantId },
      });
      if (!parent) {
        throw new CategoryServiceError(404, 'Parent category not found or belongs to a different restaurant');
      }
    }
    updateData.parentId = body.parentId;
  }

  if (body.description !== undefined) {
    updateData.description = body.description.trim();
  }
  if (body.imageUrl !== undefined) {
    updateData.imageUrl = body.imageUrl;
  }
  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive;
  }
  if (body.displayOrder !== undefined) {
    updateData.displayOrder = body.displayOrder;
  }

  // 4. Perform update
  const updated = await prisma.category.update({
    where: { id },
    data: updateData,
    select: CATEGORY_SELECT,
  });

  return toCategoryResponse(updated);
}

/**
 * Safely deletes a category.
 * If the category contains any assigned dishes:
 *   Blocks hard deletion and returns 400 BadRequest with a helpful message,
 *   prompting the user to either delete/reassign the dishes or deactivate the category (soft delete).
 */
export async function deleteCategory(restaurantId: string, id: string): Promise<void> {
  // 1. Verify existence
  const existing = await prisma.category.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  });

  if (!existing) {
    throw new CategoryServiceError(404, 'Category not found');
  }

  // 2. Check for assigned dishes
  const dishCount = await prisma.dish.count({
    where: { categoryId: id },
  });

  if (dishCount > 0) {
    throw new CategoryServiceError(
      400,
      `Cannot delete category: It contains ${dishCount} assigned dishes. Please delete or reassign those dishes first, or deactivate the category.`
    );
  }

  // 3. Physical delete (safe to do since there are no dependencies)
  await prisma.category.delete({
    where: { id },
  });
}
