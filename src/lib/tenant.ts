import { prisma } from './prisma';

export async function resolveRestaurantFromHeaders(headers: any) {
  const tenantSlug = headers['x-tenant-slug'] as string | undefined;
  const tenantDomain = headers['x-tenant-domain'] as string | undefined;

  if (tenantSlug) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: tenantSlug }
    });
    if (restaurant) return restaurant;
  }

  if (tenantDomain) {
    const BASE_DOMAIN = 'xfoodi.website';
    const host = tenantDomain.trim().toLowerCase();
    
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== BASE_DOMAIN && host !== `www.${BASE_DOMAIN}`) {
      let slug = host;
      if (host.endsWith('.localhost')) {
        slug = host.replace(/\.localhost$/, '');
      } else if (host.endsWith(`.${BASE_DOMAIN}`)) {
        slug = host.replace(new RegExp(`\\.${BASE_DOMAIN}$`), '');
      }
      
      if (slug !== 'admin' && slug !== 'www') {
        const restaurant = await prisma.restaurant.findFirst({
          where: {
            OR: [
              { slug: slug },
              { slug: host },
            ],
            isActive: true,
          },
        });
        if (restaurant) return restaurant;
      }
    }
  }

  return null;
}
