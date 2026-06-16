import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export const tenantGuard = async (req: any, res: Response, next: NextFunction) => {
  try {
    // 1. Resolve tenant domain from request header 'x-tenant-domain' or Referer
    let domain = req.headers['x-tenant-domain'] as string;
    if (!domain && req.headers.referer) {
      try {
        const url = new URL(req.headers.referer);
        domain = url.hostname;
      } catch (e) {
        domain = '';
      }
    }

    if (!domain) {
      // If no domain could be resolved, continue
      return next();
    }

    // Strip port if present in domain
    const hostWithoutPort = domain.includes(':') ? domain.split(':')[0] : domain;
    
    // Check if it's the admin domain or main landing domain (super admin / public bypass)
    const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'xfoodi.website';
    if (
      hostWithoutPort === BASE_DOMAIN ||
      hostWithoutPort === `www.${BASE_DOMAIN}` ||
      hostWithoutPort === `admin.${BASE_DOMAIN}` ||
      hostWithoutPort.startsWith('admin.')
    ) {
      return next();
    }

    // For local development subdomain, convert to production equivalent
    let hostname = hostWithoutPort;
    if (hostname.endsWith('.localhost')) {
      const subdomain = hostname.replace('.localhost', '');
      hostname = `${subdomain}.${BASE_DOMAIN}`;
    }

    // 2. Find the restaurant corresponding to the domain
    const slug = hostname.replace(new RegExp(`\\.${BASE_DOMAIN}$`), '');
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { slug: slug },
          { slug: hostname },
        ],
        isActive: true,
      },
    });

    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found or inactive.' });
    }

    // Attach restaurant/tenant to request object
    req.tenant = restaurant;
    req.tenantId = restaurant.id;

    // 3. If user is authenticated, verify their access to this tenant
    if (req.user) {
      const userRoles: string[] = Array.isArray(req.user.roles)
        ? req.user.roles
        : req.user.role
        ? [req.user.role]
        : [];

      const isSystemAdmin = userRoles.includes('Admin') || userRoles.includes('SuperAdmin');

      if (!isSystemAdmin) {
        // If user has Owner or Staff/Employee role, verify their restaurantId matches req.tenantId
        const isOwnerOrStaff = userRoles.includes('Owner') || userRoles.includes('Staff') || userRoles.includes('Employee');
        
        if (isOwnerOrStaff) {
          if (req.user.restaurantId !== restaurant.id) {
            console.log(`[TenantGuard] 403 Forbidden! user: ${req.user.email}, user.restaurantId: ${req.user.restaurantId}, tenant.id: ${restaurant.id}`);
            return res.status(403).json({
              success: false,
              message: "Access denied. You do not have permission to access this restaurant's resources.",
            });
          }
        }
      }
    }

    next();
  } catch (error) {
    console.error('[TenantGuard] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during tenant validation' });
  }
};
