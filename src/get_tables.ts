import { centralPrisma, getTenantPrisma, getTenantConnectionUrl } from './lib/prisma';
import { ENV } from './config/env';

async function main() {
  const restaurants = await centralPrisma.restaurant.findMany();
  console.log(`FOUND ${restaurants.length} RESTAURANTS:`);
  
  const baseUrl = process.env.DATABASE_URL || '';
  
  for (const r of restaurants) {
    console.log(`\n--- Restaurant: ${r.name} (${r.slug}) ---`);
    const connStr = getTenantConnectionUrl(baseUrl, r.slug);
    const tenantPrisma = getTenantPrisma(connStr);
    
    try {
      const tables = await tenantPrisma.table.findMany({
        include: { floor: true }
      });
      console.log(`Tables found: ${tables.length}`);
      tables.forEach(t => {
        console.log(`- Floor: ${t.floor.name} | Table Code: ${t.code} | ID: ${t.id}`);
      });
    } catch (e: any) {
      console.error(`Failed to fetch tables for ${r.slug}:`, e.message);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await centralPrisma.$disconnect();
  });
