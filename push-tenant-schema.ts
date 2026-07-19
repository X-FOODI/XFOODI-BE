/**
 * Push Prisma schema to all tenant schemas that are out of sync.
 * Run with: npx ts-node push-tenant-schema.ts
 */
import { centralPrisma, getTenantConnectionUrl } from './src/lib/prisma';
import { execSync } from 'child_process';

async function main() {
  const baseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';

  if (!baseUrl) {
    throw new Error('DATABASE_URL or DIRECT_URL not set');
  }

  // Get all restaurants with their slugs
  const restaurants = await centralPrisma.restaurant.findMany({
    select: { id: true, slug: true, name: true },
  });

  console.log(`Found ${restaurants.length} restaurants`);

  for (const restaurant of restaurants) {
    const tenantUrl = getTenantConnectionUrl(baseUrl, restaurant.slug);
    console.log(`\nPushing schema to tenant: ${restaurant.slug} (${restaurant.name})`);
    
    try {
      execSync(`npx prisma db push --skip-generate`, {
        env: {
          ...process.env,
          DATABASE_URL: tenantUrl,
          DIRECT_URL: tenantUrl,
        },
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      console.log(`✅ ${restaurant.slug} done`);
    } catch (err: any) {
      console.error(`❌ Failed for ${restaurant.slug}:`, err.message);
    }
  }

  await centralPrisma.$disconnect();
  console.log('\nAll tenants processed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
