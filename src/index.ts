import express from 'express';
import helmet from 'helmet';
import dashboardRoutes from './models/routes/dashboard';
import http from 'http';
import cors from 'cors';
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
import { registerSocialModule } from './modules/social/social.module';
import { initSocialRealtime } from './modules/social/realtime/social-socket';
import floorsRoutes from './models/routes/floors';
import tablesRoutes from './models/routes/tables';
import reservationRoutes from './models/routes/reservations';
import paymentRoutes from './models/routes/payments';
import feedbackRoutes from './models/routes/feedbacks';
import walletRoutes from './models/routes/wallet';
import vatInvoiceRoutes from './models/routes/vat-invoices';
import layoutsRoutes from './models/routes/layouts';
import employeeRoutes from './models/routes/employees';
import customerRoutes from './routes/customer.routes';
import voucherRoutes from './routes/voucher.route';
import ingredientsRoutes from './models/routes/ingredients';
import { API_ROUTES } from './constants/routes';
import { ENV } from './config/env';
import { UploadQueueService } from './services/uploadQueue.service';
import { startReservationCronJobs } from './cron/reservationCron';
import { startStockReleaseCron } from './cron/stockReleaseCron';
import { initOrderQueue } from './services/order.queue';
import adminRoutes from './models/routes/admin';
import announcementRoutes from './models/routes/announcements';
import settingsRoutes from './models/routes/settings';
import { maintenanceMiddleware } from './middlewares/maintenance';

// Trigger restart after Prisma generate
const app = express();
const httpServer = http.createServer(app);
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

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Global Maintenance Middleware
app.use(maintenanceMiddleware);

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
    const isLocalDevHost = hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1';
    let activeClient = centralPrisma;

    if (
      hostWithoutPort &&
      !isLocalDevHost &&
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
        if (restaurant.status === 'DISABLED' && !req.path.startsWith('/api/tenants')) {
          return res.status(403).json({ success: false, message: 'This restaurant has been disabled.', reason: restaurant.disabledReason });
        }

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
              // Chỉ sync các fields cơ bản — tenant DB không có cột
              // status/disabledAt/disabledBy/disabledReason (chỉ có trong Central DB)
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
                loyaltyPointRate: (restaurant as any).loyaltyPointRate ?? 10000,
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
                loyaltyPointRate: (restaurant as any).loyaltyPointRate ?? 10000,
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
registerSocialModule(app);
app.use('/api/floors', floorsRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/vat-invoices', vatInvoiceRoutes);
app.use('/api/layouts', layoutsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/announcements', announcementRoutes);

// Health check endpoint
app.get(API_ROUTES.HEALTH.BASE, (req, res) => {
  res.json({ status: 'ok', message: 'XFoodi API is running' });
});

// Initialize Socket.io
initializeSocket(httpServer);

// Initialize Social Realtime
initSocialRealtime(httpServer);

async function ensureSystemRestaurant() {
  try {
    const existing = await centralPrisma.restaurant.findUnique({ where: { id: 'system' } });
    if (!existing) {
      const adminUser = (await centralPrisma.user.findFirst({ where: { email: 'xfoodiprojects@gmail.com' } })) || (await centralPrisma.user.findFirst());
      if (adminUser) {
        await centralPrisma.restaurant.create({
          data: {
            id: 'system',
            name: 'XFoodi System AI Knowledge Base',
            slug: 'system',
            ownerId: adminUser.id,
            description: 'Hệ thống tri thức AI toàn cục XFoodi',
          },
        });
        console.log('[SystemInit] Ensured System Restaurant record (id: "system").');
      }
    }
  } catch (err) {
    console.error('[SystemInit] Failed to ensure system restaurant:', err);
  }
}

// Start server
httpServer.listen(PORT, async () => {
  console.log(`🚀 XFoodi API Server running on http://localhost:${PORT}`);
  
  await ensureSystemRestaurant();
  // Initialize Background Upload Queue
  UploadQueueService.initialize();
  // Initialize BullMQ order-completion queue (async loyalty + retry)
  initOrderQueue();
  // Start reservation cron jobs (reminder + payment deadline enforcement)
  startReservationCronJobs();
  // Auto-release reserved stock for abandoned orders (TTL)
  startStockReleaseCron();
  console.log(`- Auth API:  http://localhost:${PORT}${API_ROUTES.AUTH.BASE}`);
  console.log(`- User API:  http://localhost:${PORT}${API_ROUTES.USERS.BASE}`);
  console.log(`- Tenant API: http://localhost:${PORT}${API_ROUTES.TENANTS.BASE}`);
  console.log(`- Restaurant Applications: http://localhost:${PORT}${API_ROUTES.RESTAURANT_APPLICATIONS.BASE}`);
  console.log(`- Social API: http://localhost:${PORT}${API_ROUTES.SOCIAL.BASE}`);
  console.log(`- Social realtime: http://localhost:${PORT}/hubs/social (Socket.io)`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// On deploy/restart the orchestrator sends SIGTERM; stop accepting new
// connections, then disconnect Prisma so in-flight work can drain cleanly.
let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Shutdown] Received ${signal}, closing server...`);

  const forceExit = setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10_000);

  httpServer.close(async () => {
    try {
      await centralPrisma.$disconnect();
    } catch (e) {
      console.error('[Shutdown] Error disconnecting Prisma:', e);
    }
    clearTimeout(forceExit);
    console.log('[Shutdown] Closed cleanly');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
