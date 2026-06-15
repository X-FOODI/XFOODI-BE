import { PrismaClient } from '@prisma/client';
import { prismaStorage } from '../lib/prisma';

function getPrisma(): PrismaClient {
  return prismaStorage.getStore() as PrismaClient;
}

export interface CreateFeedbackDto {
  orderId: string;
  customerId: string;
  rating: number;        // 1–5
  comment?: string;
  isAnonymous?: boolean;
  imageUrls?: string[];  // pre-uploaded via Cloudinary
}

export interface FeedbackFilterParams {
  restaurantId?: string;
  page?: number;
  limit?: number;
  minRating?: number;
  maxRating?: number;
  isPublished?: boolean;
  search?: string;
}

export interface UpdateFeedbackDto {
  rating?: number;
  comment?: string;
  isAnonymous?: boolean;
  isPublished?: boolean;   // admin only
}

export class FeedbackService {

  async create(dto: CreateFeedbackDto) {
    const prisma = getPrisma();

    // Validate order exists + belongs to customer
    const order = await prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, customerId: true, restaurantId: true },
    });
    if (!order) throw new Error('Order not found');

    // Prevent duplicate feedback per order
    const existing = await prisma.feedback.findFirst({ where: { orderId: dto.orderId } });
    if (existing) throw new Error('Feedback already submitted for this order');

    if (dto.rating < 1 || dto.rating > 5) throw new Error('Rating must be between 1 and 5');

    const feedback = await prisma.feedback.create({
      data: {
        orderId: dto.orderId,
        customerId: dto.customerId,
        rating: dto.rating,
        comment: dto.comment,
        isAnonymous: dto.isAnonymous ?? false,
        isPublished: true,  // auto-publish (staff can hide later)
        images: dto.imageUrls
          ? {
              create: dto.imageUrls.map((url, i) => ({
                imageUrl: url,
                displayOrder: i,
                isCover: i === 0,
              })),
            }
          : undefined,
      },
      include: {
        customer: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
        images: { orderBy: { displayOrder: 'asc' } },
        order: { select: { id: true, reference: true } },
      },
    });

    return feedback;
  }

  async getById(id: string) {
    const prisma = getPrisma();
    return prisma.feedback.findUnique({
      where: { id },
      include: {
        customer: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
        images: { orderBy: { displayOrder: 'asc' } },
        order: { select: { id: true, reference: true } },
      },
    });
  }

  async getByOrderId(orderId: string) {
    const prisma = getPrisma();
    return prisma.feedback.findFirst({
      where: { orderId },
      include: {
        customer: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
        images: { orderBy: { displayOrder: 'asc' } },
      },
    });
  }

  async list(filter: FeedbackFilterParams) {
    const prisma = getPrisma();
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filter.restaurantId) where.order = { restaurantId: filter.restaurantId };
    if (filter.isPublished !== undefined) where.isPublished = filter.isPublished;
    if (filter.minRating !== undefined) where.rating = { gte: filter.minRating };
    if (filter.maxRating !== undefined) where.rating = { ...where.rating, lte: filter.maxRating };
    if (filter.search) {
      where.OR = [
        { comment: { contains: filter.search, mode: 'insensitive' } },
        { customer: { user: { fullName: { contains: filter.search, mode: 'insensitive' } } } },
        { order: { reference: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
          images: { orderBy: { displayOrder: 'asc' }, take: 1 },
          order: { select: { id: true, reference: true } },
        },
      }),
      prisma.feedback.count({ where }),
    ]);

    // Rating stats — filter by restaurant via order relation
    const statsWhere: any = filter.restaurantId ? { order: { restaurantId: filter.restaurantId } } : undefined;
    const stats = await prisma.feedback.aggregate({
      where: statsWhere,
      _avg: { rating: true },
      _count: true,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      averageRating: Number(((stats._avg?.rating ?? 0)).toFixed(1)),
      totalCount: stats._count,
    };
  }

  async update(id: string, dto: UpdateFeedbackDto, callerId: string, isAdmin = false) {
    const prisma = getPrisma();
    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new Error('Feedback not found');

    // Only owner or admin can update
    const customer = await prisma.customer.findFirst({ where: { userId: callerId } });
    if (!isAdmin && feedback.customerId !== customer?.id) {
      throw new Error('Not allowed to update this feedback');
    }
    if (!isAdmin && dto.isPublished !== undefined) {
      throw new Error('Only admin can change publish status');
    }

    return prisma.feedback.update({
      where: { id },
      data: {
        rating: dto.rating,
        comment: dto.comment,
        isAnonymous: dto.isAnonymous,
        ...(isAdmin && dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
      },
      include: {
        customer: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        images: true,
      },
    });
  }

  async delete(id: string, callerId: string, isAdmin = false) {
    const prisma = getPrisma();
    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) return;

    const customer = await prisma.customer.findFirst({ where: { userId: callerId } });
    if (!isAdmin && feedback.customerId !== customer?.id) {
      throw new Error('Not allowed to delete this feedback');
    }

    await prisma.feedback.delete({ where: { id } });
  }

  async togglePublish(id: string, isPublished: boolean) {
    const prisma = getPrisma();
    return prisma.feedback.update({
      where: { id },
      data: { isPublished },
    });
  }
}

export const feedbackService = new FeedbackService();
