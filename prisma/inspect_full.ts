import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Querying Restaurants in public schema...');
  const restaurants = await prisma.restaurant.findMany();
  console.log(`Found ${restaurants.length} restaurants:`, restaurants);

  console.log('\n🔍 Querying Postgres schemas in Database...');
  const schemas: any[] = await prisma.$queryRawUnsafe(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'`
  );
  console.log('Schemas:', schemas.map((s) => s.schema_name));

  for (const s of schemas) {
    const schemaName = s.schema_name;
    try {
      const catCount: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "${schemaName}"."Categories"`
      );
      const dishCount: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "${schemaName}"."Dishes"`
      );
      console.log(`   Schema [${schemaName}]: Categories = ${catCount[0]?.count}, Dishes = ${dishCount[0]?.count}`);
    } catch (err: any) {
      console.log(`   Schema [${schemaName}]: (No Categories/Dishes tables or error: ${err.message})`);
    }
  }
}

main().finally(() => prisma.$disconnect());
