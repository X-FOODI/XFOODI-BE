import express from 'express';
import cors from 'cors';
import http from 'http';
import { initializeSocket } from './socket';
import path from 'path';
import authRoutes from './models/routes/auth';
import tenantRoutes from './models/routes/tenants';
import restaurantApplicationRoutes from './models/routes/restaurant-applications';
import restaurantRoutes from './models/routes/restaurants';
import userRoutes from './models/routes/users';
import uploadRoutes from './models/routes/upload';
import ordersRoutes from './models/routes/orders';
import aiRoutes from './models/routes/ai';
import categoryRoutes from './models/routes/categories';
import dishRoutes from './models/routes/dishes';
import { API_ROUTES } from './constants/routes';
import { ENV } from './config/env';
import { UploadQueueService } from './services/uploadQueue.service';


const app = express();
const PORT = ENV.PORT;

// Import tenant routing utilities
import { prismaStorage, centralPrisma, getTenantPrisma, getTenantConnectionUrl } from './lib/prisma';

// Middleware
app.use(cors({
  origin: [ENV.FRONTEND_URL, 'http://localhost:3000', /\.xfoodi\.website$/],
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Multi-tenant database routing middleware using AsyncLocalStorage
app.use(async (req: any, res: any, next) => {
  try {
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
      domain = req.headers.host || '';
    }

    const hostWithoutPort = domain.includes(':') ? domain.split(':')[0] : domain;
    const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'xfoodi.website';
    let activeClient = centralPrisma;

    if (
      hostWithoutPort &&
      hostWithoutPort !== BASE_DOMAIN &&
      hostWithoutPort !== `www.${BASE_DOMAIN}` &&
      hostWithoutPort !== `admin.${BASE_DOMAIN}` &&
      !hostWithoutPort.startsWith('admin.')
    ) {
      let hostname = hostWithoutPort;
      if (hostname.endsWith('.localhost')) {
        const subdomain = hostname.replace('.localhost', '');
        hostname = `${subdomain}.${BASE_DOMAIN}`;
      }

      const slug = hostname.replace(new RegExp(`\\.${BASE_DOMAIN}$`), '');
      
      const restaurant = await centralPrisma.restaurant.findFirst({
        where: {
          OR: [
            { slug: slug },
            { slug: hostname },
          ],
          isActive: true,
        },
      });

      if (restaurant) {
        const tenantDbUrl = getTenantConnectionUrl(ENV.DATABASE_URL, restaurant.slug);
        activeClient = getTenantPrisma(tenantDbUrl);
      }
    }

    prismaStorage.run(activeClient, () => {
      next();
    });
  } catch (error) {
    console.error('[TenantDbMiddleware] Error resolving tenant database:', error);
    prismaStorage.run(centralPrisma, () => {
      next();
    });
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n>>> [${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use(API_ROUTES.AUTH.BASE, authRoutes);
app.use(API_ROUTES.USERS.BASE, userRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use(API_ROUTES.TENANTS.BASE, tenantRoutes);
app.use(API_ROUTES.RESTAURANT_APPLICATIONS.BASE, restaurantApplicationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/ai', aiRoutes);
app.use(API_ROUTES.CATEGORIES.BASE, categoryRoutes);
app.use(API_ROUTES.DISHES.BASE, dishRoutes);

// Health check endpoint
app.get(API_ROUTES.HEALTH.BASE, (req, res) => {
  res.json({ status: 'ok', message: 'XFoodi API is running' });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
initializeSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 XFoodi API Server running on http://localhost:${PORT}`);
  
  // Initialize Background Upload Queue
  UploadQueueService.initialize();
  console.log(`- Auth API:  http://localhost:${PORT}${API_ROUTES.AUTH.BASE}`);
  console.log(`- User API:  http://localhost:${PORT}${API_ROUTES.USERS.BASE}`);
  console.log(`- Tenant API: http://localhost:${PORT}${API_ROUTES.TENANTS.BASE}`);
  console.log(`- Restaurant Applications: http://localhost:${PORT}${API_ROUTES.RESTAURANT_APPLICATIONS.BASE}`);
});
