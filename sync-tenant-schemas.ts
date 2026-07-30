import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const centralPrisma = new PrismaClient();

async function main() {
  const restaurants = await centralPrisma.restaurant.findMany({ select: { slug: true } });
  
  for (const rest of restaurants) {
    console.log('Syncing tenant:', rest.slug);
    const tenantDbUrl = process.env.DATABASE_URL!.replace(/\/postgres(\?|$)/, '/tenant_' + rest.slug + '$1');
    const tenantDirectUrl = process.env.DIRECT_URL!.replace(/\/postgres(\?|$)/, '/tenant_' + rest.slug + '$1');
    
    try {
      // First, create a temporary client to ensure DB exists and extension is enabled
      const tempPrisma = new PrismaClient({
        datasources: { db: { url: tenantDirectUrl } }
      });
      try {
        // This will create the database if it doesn't exist (when we attempt to connect, wait, prisma doesn't auto-create on client connect)
        // Wait, prisma db push creates the db. So we should run db push first, let it fail on vector, then run create extension, then push again?
        // Actually, we can just let prisma db push create it, and if it fails with vector, we catch it, enable vector, and push again!
        // But how to connect to it if it was just created? We can connect using tenantDirectUrl.
        await tempPrisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
      } catch (err: any) {
        if (err.message && err.message.includes('does not exist')) {
           // Database didn't exist yet, so we have to run db push first, catch the vector error, then run this.
        } else {
           console.log('Error creating extension:', err.message);
        }
      } finally {
        await tempPrisma.$disconnect();
      }

      try {
         execSync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate', { 
           env: { ...process.env, DATABASE_URL: tenantDbUrl, DIRECT_URL: tenantDirectUrl }, 
           stdio: 'pipe' 
         });
      } catch (pushErr: any) {
         // It might have failed because of vector type after creating the DB. Let's try enabling it now.
         const tempPrisma2 = new PrismaClient({ datasources: { db: { url: tenantDirectUrl } } });
         await tempPrisma2.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
         await tempPrisma2.$disconnect();
         // Try pushing again
         execSync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate', { 
           env: { ...process.env, DATABASE_URL: tenantDbUrl, DIRECT_URL: tenantDirectUrl }, 
           stdio: 'pipe' 
         });
      }
      console.log('✅ Synced', rest.slug);
    } catch (e) { 
      console.error('❌ Failed to sync', rest.slug, e); 
    }
  }
}

main().catch(console.error).finally(() => centralPrisma.$disconnect());
