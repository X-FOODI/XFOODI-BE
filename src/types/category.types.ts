export interface CreateCategoryBody {
  name: string;
  description: string;
  restaurantId?: string;
  imageUrl?: string | null;
  parentId?: string | null;
  displayOrder?: number;
}

export interface UpdateCategoryBody {
  name?: string;
  description?: string;
  imageUrl?: string | null;
  parentId?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CategoryQuery {
  page?: string | number;
  limit?: string | number;
  search?: string;
  status?: 'active' | 'inactive' | 'all' | string;
  restaurantId?: string;
}

export interface CategoryResponse {
  id: string;
  name: string;
  description: string;
  restaurantId: string;
  imageUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  modifiedBy: string | null;
}

export interface PaginatedCategories {
  data: CategoryResponse[];
  total: number;
  page: number;
  limit: number;
}
