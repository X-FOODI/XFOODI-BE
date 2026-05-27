import express from 'express';
import http from 'http';
import cors from 'cors';
import authRoutes from './routes/auth';
import tenantRoutes from './routes/tenants';
import userRoutes from './routes/users';
import { registerSocialModule } from './modules/social/social.module';
import { initSocialRealtime } from './modules/social/realtime/social-socket';
import { API_ROUTES } from './constants/routes';
import { ENV } from './config/env';

const app = express();
const httpServer = http.createServer(app);
const PORT = ENV.PORT;

// Middleware
app.use(cors({
  origin: [ENV.FRONTEND_URL, 'http://localhost:3000', /\.xfoodi\.website$/],
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n>>> [${timestamp}] ${req.method} ${req.url}`);
  console.log('>>> Headers:', JSON.stringify(req.headers, null, 2));
  console.log('>>> Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Routes
app.use(API_ROUTES.AUTH.BASE, authRoutes);
app.use(API_ROUTES.USERS.BASE, userRoutes);
app.use(API_ROUTES.TENANTS.BASE, tenantRoutes);
registerSocialModule(app);

// Health check endpoint
app.get(API_ROUTES.HEALTH.BASE, (req, res) => {
  res.json({ status: 'ok', message: 'XFoodi API is running' });
});

initSocialRealtime(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 XFoodi API Server running on http://localhost:${PORT}`);
  console.log(`- Auth API:  http://localhost:${PORT}${API_ROUTES.AUTH.BASE}`);
  console.log(`- User API:  http://localhost:${PORT}${API_ROUTES.USERS.BASE}`);
  console.log(`- Tenant API: http://localhost:${PORT}${API_ROUTES.TENANTS.BASE}`);
  console.log(`- Social API: http://localhost:${PORT}${API_ROUTES.SOCIAL.BASE}`);
  console.log(`- Social realtime: http://localhost:${PORT}/hubs/social (Socket.io)`);
});
