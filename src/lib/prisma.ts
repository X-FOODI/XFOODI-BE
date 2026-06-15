import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

// Prevent multiple instances of Prisma Client in development
declare global {
  // eslint-disable-next-line no-var
  var centralPrisma: PrismaClient | undefined;
}

// AsyncLocalStorage to hold the active PrismaClient for the current request context
export const prismaStorage = new AsyncLocalStorage<PrismaClient>();

// Central/Default Prisma Client pointing to the host database (default schema: public)
export const centralPrisma = global.centralPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.centralPrisma = centralPrisma;

// Cache of tenant-specific PrismaClients to avoid connection leaks
const tenantClients: Record<string, PrismaClient> = {};

/**
 * Get or create a PrismaClient for a specific tenant connection string
 */
export function getTenantPrisma(connectionString: string): PrismaClient {
  if (!tenantClients[connectionString]) {
    tenantClients[connectionString] = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    });
  }
  return tenantClients[connectionString];
}

/**
 * Utility to helper build tenant connection URL
 */
export function getTenantConnectionUrl(baseUrl: string, slug: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('schema', `tenant_${slug}`);
    return url.toString();
  } catch (e) {
    if (baseUrl.includes('?')) {
      const cleanUrl = baseUrl.split('?')[0];
      const params = new URLSearchParams(baseUrl.split('?')[1]);
      params.set('schema', `tenant_${slug}`);
      return `${cleanUrl}?${params.toString()}`;
    } else {
      return `${baseUrl}?schema=tenant_${slug}`;
    }
  }
}

// Export a Proxy of PrismaClient that dynamically delegates to the active client in the current request store.
// If no request context exists (e.g. background jobs, seed scripts), it defaults to the central database.
// Central models are forced to run against centralPrisma (public schema) because they do not have tenant-specific rows.
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const centralModels = [
      'restaurant',
      'user',
      'role',
      'userRole',
      'userSession',
      'restaurantApplication',
    ];

    // Determine whether to use the central client or the tenant-specific client
    const useCentral = typeof prop === 'string' && centralModels.includes(prop);
    const activeClient = useCentral
      ? centralPrisma
      : (prismaStorage.getStore() || centralPrisma);
    
    // Delegate property access to the chosen client
    const value = Reflect.get(activeClient, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  },
});
