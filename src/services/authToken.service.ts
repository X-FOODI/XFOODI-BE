import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ENV } from '../config/env';

export type AuthTokenUser = {
  id: string;
  email: string | null;
  fullName: string | null;
};

export function generateAccessAndRefreshTokens(
  user: AuthTokenUser,
  roles: string[],
  restaurantId?: string | null
): { accessToken: string; refreshToken: string } {
  const primaryRole = roles.length > 0 ? roles[0] : 'Customer';

  const payload = {
    jti: randomUUID(),
    sub: user.id,
    email: user.email,
    // Legacy: single role (backward compat)
    role: primaryRole,
    // New: full roles array
    roles,
    // If owner, which restaurant they manage
    restaurantId: restaurantId ?? null,
    nameid: user.id,
    unique_name: user.email,
    fullName: user.fullName,
  };

  const accessToken = jwt.sign(payload, ENV.JWT.ACCESS_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ sub: user.id }, ENV.JWT.REFRESH_SECRET, { expiresIn: '7d' });

  return { accessToken, refreshToken };
}
