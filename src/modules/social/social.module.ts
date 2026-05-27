import type { Express } from 'express';
import socialRoutes from './routes/social.routes';
import communityRoutes from './routes/community.routes';
import { API_ROUTES } from '../../constants/routes';

/**
 * Registers the Social Community / Blog module on the Express app.
 */
export function registerSocialModule(app: Express): void {
  app.use(API_ROUTES.SOCIAL.BASE, socialRoutes);
  app.use(API_ROUTES.SOCIAL.BASE, communityRoutes);
}

export { default as socialRouter } from './routes/social.routes';
export { default as communityRouter } from './routes/community.routes';
