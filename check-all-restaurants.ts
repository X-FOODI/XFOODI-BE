import { prisma } from './src/lib/prisma';

async function main() {
  const restaurants = await prisma.restaurant.findMany({});
  console.log("=== RESTAURANTS IN DATABASE ===");
  console.log(JSON.stringify(restaurants, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
