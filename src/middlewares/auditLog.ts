import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import path from 'path';

// Dedicated logger for administrative audit log
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join('logs', 'audit.log')
    })
  ]
});

const SKIP_PATHS = ['/api/auth/me', '/api/users/me'];
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function deriveAction(method: string, reqPath: string): string {
  const parts = reqPath.split('/').filter(Boolean);
  const resource = parts[parts.length - 1] || parts[parts.length - 2] || 'unknown';
  return `${method} ${resource}`.toUpperCase();
}

function deriveResource(reqPath: string): string {
  const parts = reqPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

export function auditLogMiddleware(req: any, res: Response, next: NextFunction): void {
  // Only log state-changing operations
  if (!WRITE_METHODS.includes(req.method)) {
    return next();
  }

  // Skip polling or metadata paths
  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const originalJson = res.json.bind(res);
  let responseBody: any;

  res.json = function (body: any) {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    try {
      const user = req.user;
      if (!user) return;

      // Extract details
      const userRoles = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
      const isAdmin = userRoles.some((r: string) => ['Admin', 'SuperAdmin', 'System Admin'].includes(r));

      // We only audit write actions performed by admins/system admins
      if (!isAdmin) return;

      const actorEmail = user.email || 'unknown@user';
      const actorName = user.fullName || user.name || actorEmail.split('@')[0];

      auditLogger.info({
        timestamp: new Date().toISOString(),
        actor: {
          userId: user.sub || user.id || '',
          email: actorEmail,
          name: actorName,
          roles: userRoles,
        },
        action: deriveAction(req.method, req.path),
        resource: deriveResource(req.path),
        resourceId: req.params.id || '',
        method: req.method,
        path: req.path,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        statusCode: res.statusCode,
        status: res.statusCode >= 200 && res.statusCode < 300 ? 'SUCCESS' : 'FAILED',
        response: res.statusCode >= 200 && res.statusCode < 300 ? responseBody : { error: 'Request failed' }
      });
    } catch (err: any) {
      console.error('[AuditLog] Error writing audit log:', err.message);
    }
  });

  next();
}
