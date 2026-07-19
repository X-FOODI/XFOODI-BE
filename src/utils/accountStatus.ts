import { centralPrisma } from '../lib/prisma';

export function isUserAccountDisabled(user: {
  status?: string | null;
  isActive?: boolean | null;
}): boolean {
  return user.status === 'DISABLED' || user.isActive === false;
}

export async function resolveUserDisableReason(
  userId: string,
  disabledReason?: string | null
): Promise<string> {
  if (disabledReason?.trim()) {
    return disabledReason.trim();
  }

  const log = await centralPrisma.auditLog.findFirst({
    where: { targetId: userId, action: 'USER_DISABLED' },
    orderBy: { createdAt: 'desc' },
    select: { reason: true },
  });

  return log?.reason?.trim() || 'Không có lý do được cung cấp';
}

export async function resolveRestaurantDisableReason(
  restaurantId: string,
  disabledReason?: string | null
): Promise<string> {
  if (disabledReason?.trim()) {
    return disabledReason.trim();
  }

  const log = await centralPrisma.auditLog.findFirst({
    where: { targetId: restaurantId, action: 'RESTAURANT_DISABLED' },
    orderBy: { createdAt: 'desc' },
    select: { reason: true },
  });

  return log?.reason?.trim() || 'Không có lý do được cung cấp';
}

export const USER_DISABLED_MESSAGE = 'Tài khoản của bạn đã bị khóa.';
export const RESTAURANT_DISABLED_MESSAGE = 'Nhà hàng của bạn đã bị khóa trên hệ thống.';
