import { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory to guard routes by role.
 * Reads req.user.roles (array) or req.user.role (string, legacy).
 *
 * Usage: router.post('/approve', authMiddleware, requireRole('Admin'), handler)
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Support both req.user.roles (array) and req.user.role (string, legacy)
    const userRoles: string[] = Array.isArray(req.user.roles)
      ? req.user.roles
      : req.user.role
      ? [req.user.role]
      : [];

    const hasRole = allowedRoles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
};
