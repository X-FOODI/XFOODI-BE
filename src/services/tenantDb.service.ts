import { exec } from 'child_process';
import util from 'util';
import { ENV } from '../config/env';
import { getTenantPrisma, getTenantConnectionUrl } from '../lib/prisma';

const execPromise = util.promisify(exec);

/**
 * Run Prisma migrations (db push) to initialize/update a tenant's database schema.
 */
export async function runMigrationsForTenant(slug: string): Promise<void> {
  const directUrl = ENV.DIRECT_URL || ENV.DATABASE_URL;
  const tenantDirectUrl = getTenantConnectionUrl(directUrl, slug);

  console.log(`[TenantDbService] Initializing database schema for tenant "${slug}"...`);
  
  // Execute Prisma CLI to push the schema to the target tenant's connection string
  // We use npx prisma db push to dynamically create the schema and all tables.
  // We add --skip-generate to prevent EPERM file locking errors on Windows.
  const command = `npx prisma db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate`;
  
  try {
    const { stdout, stderr } = await execPromise(command, {
      env: {
        ...process.env,
        DATABASE_URL: tenantDirectUrl,
        DIRECT_URL: tenantDirectUrl, // Set both to tenant schema URL
      },
    });
    console.log(`[TenantDbService] Prisma output for "${slug}":\n`, stdout);
    if (stderr) {
      console.warn(`[TenantDbService] Prisma warning output:\n`, stderr);
    }
  } catch (error) {
    console.error(`[TenantDbService] Failed to push schema for tenant "${slug}":`, error);
    throw error;
  }
}

/**
 * Seed a new tenant database with roles and create the Owner user account.
 */
export async function seedTenantDatabase(
  slug: string, 
  ownerData: { id: string; email: string; fullName: string; phoneNumber?: string; passwordHash?: string }
): Promise<void> {
  const tenantDbUrl = getTenantConnectionUrl(ENV.DATABASE_URL, slug);
  const tenantPrisma = getTenantPrisma(tenantDbUrl);

  console.log(`[TenantDbService] Seeding database for tenant "${slug}"...`);

  try {
    // 1. Create standard roles
    const rolesToCreate = ['Owner', 'Customer', 'Staff', 'Employee'];
    
    for (const roleName of rolesToCreate) {
      await tenantPrisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      });
    }

    // 2. Create the Owner user in the tenant's Users table
    // It's important they exist in the tenant's DB to be able to authenticate
    const tenantOwner = await tenantPrisma.user.upsert({
      where: { id: ownerData.id },
      update: {
        email: ownerData.email,
        fullName: ownerData.fullName,
        phoneNumber: ownerData.phoneNumber || null,
        passwordHash: ownerData.passwordHash || null,
        isActive: true,
        emailVerified: true,
      },
      create: {
        id: ownerData.id,
        email: ownerData.email,
        userName: ownerData.email,
        fullName: ownerData.fullName,
        phoneNumber: ownerData.phoneNumber || null,
        passwordHash: ownerData.passwordHash || null,
        isActive: true,
        emailVerified: true,
      },
    });

    // 3. Assign the Owner role to this user in the tenant's UserRoles table
    const ownerRole = await tenantPrisma.role.findUnique({
      where: { name: 'Owner' },
    });

    if (ownerRole) {
      await tenantPrisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: ownerData.id,
            roleId: ownerRole.id,
          }
        },
        update: {},
        create: {
          userId: ownerData.id,
          roleId: ownerRole.id,
        },
      });
    }

    console.log(`[TenantDbService] Seeding completed successfully for tenant "${slug}".`);
  } catch (error) {
    console.error(`[TenantDbService] Error seeding tenant database "${slug}":`, error);
    throw error;
  }
}
