import type { RequestHandler } from 'express';
import redisClient from '../../../lib/redis';

const WINDOW_SEC = 60;
const MAX_REQUESTS = 120;

/**
 * Redis-backed rate limiter for social write endpoints (additive middleware).
 */
export function socialRateLimitMiddleware(prefix = 'social:rl'): RequestHandler {
  return async (req: any, res, next) => {
    const userId = req.user?.sub as string | undefined;
    const key = userId
      ? `${prefix}:user:${userId}`
      : `${prefix}:ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;

    try {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, WINDOW_SEC);
      }
      if (count > MAX_REQUESTS) {
        return res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
        });
      }
      next();
    } catch {
      next();
    }
  };
}
