import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import tenantRoutes from './routes/tenants';
import restaurantApplicationRoutes from './routes/restaurant-applications';
import { API_ROUTES } from './constants/routes';
import { ENV } from './config/env';

const app = express();
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
  next();
});

// Routes
app.use(API_ROUTES.AUTH.BASE, authRoutes);
app.use(API_ROUTES.TENANTS.BASE, tenantRoutes);
app.use(API_ROUTES.RESTAURANT_APPLICATIONS.BASE, restaurantApplicationRoutes);

// Health check endpoint
app.get(API_ROUTES.HEALTH.BASE, (req, res) => {
  res.json({ status: 'ok', message: 'XFoodi API is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 XFoodi API Server running on http://localhost:${PORT}`);
  console.log(`- Auth API: http://localhost:${PORT}${API_ROUTES.AUTH.BASE}`);
  console.log(`- Tenant API: http://localhost:${PORT}${API_ROUTES.TENANTS.BASE}`);
  console.log(`- Restaurant Applications: http://localhost:${PORT}${API_ROUTES.RESTAURANT_APPLICATIONS.BASE}`);
});
