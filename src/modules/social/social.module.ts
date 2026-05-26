import type { Express } from 'express';
import socialRoutes from './routes/social.routes';
import { API_ROUTES } from '../../constants/routes';

/**
 * Registers the Social Community / Blog module on the Express app.
 */
export function registerSocialModule(app: Express): void {
  app.use(API_ROUTES.SOCIAL.BASE, socialRoutes);
}

export { default as socialRouter } from './routes/social.routes';
