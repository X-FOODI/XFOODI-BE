import { Request, Response, NextFunction } from 'express';
import { centralPrisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export const maintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Get settings from Redis cache first
    let maintenanceMode = await redisClient.get('maintenance_mode');
    let allowAdminLogin = await redisClient.get('maintenance_allow_admin');
    let maintenanceMessage = await redisClient.get('maintenance_message');
    let estimatedFinish = await redisClient.get('maintenance_finish');

    // 2. If not in cache, fetch from DB and cache for 60 seconds
    if (maintenanceMode === null) {
      const settings = await centralPrisma.systemSetting.findMany({
        where: {
          key: {
            in: ['maintenanceMode', 'allowAdminLogin', 'maintenanceMessage', 'estimatedFinish']
          }
        }
      });

      const settingsMap = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);

      maintenanceMode = settingsMap['maintenanceMode'] || 'false';
      allowAdminLogin = settingsMap['allowAdminLogin'] || 'true';
      maintenanceMessage = settingsMap['maintenanceMessage'] || 'Hệ thống đang được bảo trì. Vui lòng quay lại sau.';
      estimatedFinish = settingsMap['estimatedFinish'] || '';

      // Cache them for 60s
      await redisClient.setEx('maintenance_mode', 60, maintenanceMode);
      await redisClient.setEx('maintenance_allow_admin', 60, allowAdminLogin);
      await redisClient.setEx('maintenance_message', 60, maintenanceMessage);
      await redisClient.setEx('maintenance_finish', 60, estimatedFinish);
    }

    // 3. If maintenance mode is OFF, proceed
    if (maintenanceMode !== 'true') {
      return next();
    }

    // 4. Maintenance mode is ON
    const path = req.path;

    // Check if the user is an admin by decoding the JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, ENV.JWT.ACCESS_SECRET) as any;
        const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
        const isAdmin = roles.some((r: string) => ['Admin', 'SuperAdmin', 'System Admin'].includes(r));
        if (isAdmin) {
          return next();
        }
      } catch (e) {
        // Ignore token errors, let it fall through
      }
    }

    // Always allow Admin Settings API so admin can turn it off
    if (path.startsWith('/api/admin/settings')) {
      return next();
    }

    // Check if we should allow admin login
    if (allowAdminLogin === 'true') {
      // Allow auth routes so admin can authenticate
      if (path.startsWith('/api/auth')) {
        return next();
      }
      // Allow admin routes
      if (path.startsWith('/api/admin')) {
        return next();
      }
    }

    // For all other requests (or if allowAdminLogin is false), return 503 Maintenance
    return res.status(503).json({
      success: false,
      isMaintenance: true,
      message: maintenanceMessage,
      estimatedFinish: estimatedFinish
    });

  } catch (error) {
    console.error('[MaintenanceMiddleware] Error:', error);
    // On error, let request pass to not accidentally brick the system if Redis is down
    next();
  }
};
