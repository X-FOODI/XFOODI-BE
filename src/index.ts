import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import authRoutes from './models/routes/auth';
import tenantRoutes from './models/routes/tenants';
import restaurantApplicationRoutes from './models/routes/restaurant-applications';
import restaurantRoutes from './models/routes/restaurants';
import userRoutes from './models/routes/users';
import aiRoutes from './models/routes/ai';
import categoryRoutes from './models/routes/categories';
import dishRoutes from './models/routes/dishes';
import { registerSocialModule } from './modules/social/social.module';
import { initSocialRealtime } from './modules/social/realtime/social-socket';
import { API_ROUTES } from './constants/routes';
import { ENV } from './config/env';
import { UploadQueueService } from './services/uploadQueue.service';


const app = express();
const httpServer = http.createServer(app);
const PORT = ENV.PORT;

// Middleware
app.use(cors({
  origin: [ENV.FRONTEND_URL, 'http://localhost:3000', /\.xfoodi\.website$/],
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
app.use('/api/ai', aiRoutes);
app.use(API_ROUTES.CATEGORIES.BASE, categoryRoutes);
app.use(API_ROUTES.DISHES.BASE, dishRoutes);
registerSocialModule(app);

// Health check endpoint
app.get(API_ROUTES.HEALTH.BASE, (req, res) => {
  res.json({ status: 'ok', message: 'XFoodi API is running' });
});

initSocialRealtime(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 XFoodi API Server running on http://localhost:${PORT}`);
  
  // Initialize Background Upload Queue
  UploadQueueService.initialize();
  console.log(`- Auth API:  http://localhost:${PORT}${API_ROUTES.AUTH.BASE}`);
  console.log(`- User API:  http://localhost:${PORT}${API_ROUTES.USERS.BASE}`);
  console.log(`- Tenant API: http://localhost:${PORT}${API_ROUTES.TENANTS.BASE}`);
  console.log(`- Restaurant Applications: http://localhost:${PORT}${API_ROUTES.RESTAURANT_APPLICATIONS.BASE}`);
  console.log(`- Social API: http://localhost:${PORT}${API_ROUTES.SOCIAL.BASE}`);
  console.log(`- Social realtime: http://localhost:${PORT}/hubs/social (Socket.io)`);
});
