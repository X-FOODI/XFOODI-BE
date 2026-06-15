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
import floorsRoutes from './models/routes/floors';
import tablesRoutes from './models/routes/tables';
import reservationRoutes from './models/routes/reservations';
import paymentRoutes from './models/routes/payments';
import feedbackRoutes from './models/routes/feedbacks';
import walletRoutes from './models/routes/wallet';
import employeeRoutes from './models/routes/employees';
import customerRoutes from './routes/customer.routes';
import { API_ROUTES } from './constants/routes';
import { ENV } from './config/env';
import { UploadQueueService } from './services/uploadQueue.service';


const app = express();
const PORT = ENV.PORT;

// Cache to store the sync state of tenants' Restaurant and Owner User records
const syncedTenants: Record<string, boolean> = {};

// Import tenant routing utilities
import { prismaStorage, centralPrisma, getTenantPrisma, getTenantConnectionUrl } from './lib/prisma';

// Middleware
const corsOptions = {
  origin: (origin: string | undefined, callback: any) => {
    if (!origin) return callback(null, true);
    const isLocalSubdomain = /^https?:\/\/[a-zA-Z0-9-]+\.localhost(:\d+)?$/.test(origin);
    const isProdSubdomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?xfoodi\.website$/.test(origin);
    const allowed =
      isLocalSubdomain ||
      isProdSubdomain ||
      origin === 'http://localhost:3000' ||
      origin === 'http://localhost:3001' ||
      origin === 'http://localhost:3002' ||
      origin === ENV.FRONTEND_URL;
    callback(null, allowed);
  },
  credentials: true
};

app.use(cors(corsOptions));
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
        // Expose restaurant on request for route handlers
        (req as any).restaurant = restaurant;

        // Lazily sync the Restaurant and its Owner User to the tenant DB schema
        // to satisfy database-level foreign key constraints (like Floors_restaurantId_fkey)
        if (!syncedTenants[restaurant.slug]) {
          try {
            // 1. Ensure the Owner User exists in the tenant schema
            const centralOwner = await centralPrisma.user.findUnique({
              where: { id: restaurant.ownerId },
            });
            if (centralOwner) {
              await activeClient.user.upsert({
                where: { id: centralOwner.id },
                update: {
                  email: centralOwner.email,
                  userName: centralOwner.userName,
                  fullName: centralOwner.fullName,
                  phoneNumber: centralOwner.phoneNumber,
                  passwordHash: centralOwner.passwordHash,
                  isActive: centralOwner.isActive,
                  emailVerified: centralOwner.emailVerified,
                },
                create: {
                  id: centralOwner.id,
                  email: centralOwner.email,
                  userName: centralOwner.userName,
                  fullName: centralOwner.fullName,
                  phoneNumber: centralOwner.phoneNumber,
                  passwordHash: centralOwner.passwordHash,
                  isActive: centralOwner.isActive,
                  emailVerified: centralOwner.emailVerified,
                },
              });
            }

            // 2. Ensure the Restaurant record exists in the tenant schema
            await activeClient.restaurant.upsert({
              where: { id: restaurant.id },
              update: {
                name: restaurant.name,
                slug: restaurant.slug,
                ownerId: restaurant.ownerId,
                planType: restaurant.planType,
                logoUrl: restaurant.logoUrl,
                description: restaurant.description,
                address: restaurant.address,
                phone: restaurant.phone,
                email: restaurant.email,
                primaryColor: restaurant.primaryColor,
                isActive: restaurant.isActive,
                metadata: restaurant.metadata as any,
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
                cuisineType: restaurant.cuisineType,
              },
              create: {
                id: restaurant.id,
                name: restaurant.name,
                slug: restaurant.slug,
                ownerId: restaurant.ownerId,
                planType: restaurant.planType,
                logoUrl: restaurant.logoUrl,
                description: restaurant.description,
                address: restaurant.address,
                phone: restaurant.phone,
                email: restaurant.email,
                primaryColor: restaurant.primaryColor,
                isActive: restaurant.isActive,
                metadata: restaurant.metadata as any,
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
                cuisineType: restaurant.cuisineType,
              },
            });

            syncedTenants[restaurant.slug] = true;
            console.log(`[TenantDbMiddleware] Successfully synced restaurant and owner user to tenant schema for "${restaurant.slug}"`);
          } catch (syncError) {
            console.error(`[TenantDbMiddleware] Failed to sync restaurant/owner to tenant "${restaurant.slug}":`, syncError);
          }
        }
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
app.use(API_ROUTES.EMPLOYEES.BASE, employeeRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use(API_ROUTES.TENANTS.BASE, tenantRoutes);
app.use('/api/restaurant/customers', customerRoutes);

// Mock /api/restaurants/me - returns restaurant info for the logged-in owner
app.get('/api/restaurants/me', (req, res) => {
  res.json({
    success: true,
    data: {
      id: 'mock-tenant-id-12345',
      name: 'Demo Restaurant',
      slug: 'demo',
      email: 'contact@demo.xfoodi.website',
      phone: '0123456789',
      address: '123 Main St',
      logoUrl: null,
      owner: {
        id: 'owner-id',
        fullName: 'Trần Văn Chủ',
        email: 'owner-test@xfoodi.com',
        avatarUrl: null
      }
    }
  });
});

app.use(API_ROUTES.RESTAURANT_APPLICATIONS.BASE, restaurantApplicationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/ai', aiRoutes);
app.use(API_ROUTES.CATEGORIES.BASE, categoryRoutes);
app.use(API_ROUTES.DISHES.BASE, dishRoutes);
app.use('/api/floors', floorsRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/wallet', walletRoutes);

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

