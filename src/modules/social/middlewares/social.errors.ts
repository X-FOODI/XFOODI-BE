import { Prisma } from '@prisma/client';

export const EMPTY_POST_LIST = {
  items: [],
  pagination: { nextCursor: null, hasMore: false },
} as const;

export function isSocialSchemaUnavailable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2021' || err.code === 'P2022')
  );
}

export class SocialServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'SocialServiceError';
  }
}

export function assertOwner(resourceOwnerId: string, userId: string, resourceLabel = 'resource'): void {
  if (resourceOwnerId !== userId) {
    throw new SocialServiceError(`You are not allowed to modify this ${resourceLabel}`, 403);
  }
}
