import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import redisClient from '../../../lib/redis';
import { ENV } from '../../../config/env';

const ACCESS_SECRET = ENV.JWT.ACCESS_SECRET;

/**
 * Attaches req.user when a valid Bearer token is present; does not fail when absent.
 */
export const optionalAuthMiddleware: RequestHandler = async (req: any, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, ACCESS_SECRET);

    if (decoded.jti) {
      const isBlacklisted = await redisClient.get(`blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        return next();
      }
    }

    req.user = decoded;
    next();
  } catch {
    next();
  }
};
