import { prisma } from './src/lib/prisma';

async function main() {
  const categories = await prisma.category.findMany({});
  console.log("=== CATEGORIES IN DATABASE ===");
  console.log(JSON.stringify(categories, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
