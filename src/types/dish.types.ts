// ─── Dish Types & DTOs ──────────────────────────────────────────────────────

export interface CreateDishBody {
  categoryId: string;
  name: string;
  description: string;
  price: number | string;
  unit: string;
  imageUrl?: string | null;
  isVegetarian?: boolean;
  isSpicy?: boolean;
  isBestSeller?: boolean;
  isActive?: boolean;
  autoDisableByStock?: boolean;
}

export interface UpdateDishBody {
  categoryId?: string;
  name?: string;
  description?: string;
  price?: number | string;
  unit?: string;
  imageUrl?: string | null;
  isVegetarian?: boolean;
  isSpicy?: boolean;
  isBestSeller?: boolean;
  isActive?: boolean;
  autoDisableByStock?: boolean;
}

export interface DishQuery {
  page?: string | number;
  limit?: string | number;
  search?: string;
  categoryId?: string;
  status?: 'active' | 'inactive' | 'all' | string;
  isVegetarian?: string;
  isSpicy?: string;
  isBestSeller?: string;
}

export interface DishResponse {
  id: string;
  categoryId: string;
  restaurantId: string;
  name: string;
  description: string;
  price: string;           // Decimal as string to preserve precision
  unit: string;
  imageUrl: string | null;
  isVegetarian: boolean;
  isSpicy: boolean;
  isBestSeller: boolean;
  isActive: boolean;
  autoDisableByStock: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    name: string;
  };
}

export interface PaginatedDishes {
  data: DishResponse[];
  total: number;
  page: number;
  limit: number;
}
