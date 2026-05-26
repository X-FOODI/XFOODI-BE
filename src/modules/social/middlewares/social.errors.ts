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
