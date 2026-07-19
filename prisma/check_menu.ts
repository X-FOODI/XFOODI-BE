import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📌 Restaurants:');
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      categories: {
        include: {
          dishes: true,
        },
      },
    },
  });

  for (const r of restaurants) {
    console.log(`\n🏪 [${r.name}] (slug: ${r.slug}, id: ${r.id})`);
    console.log(`   Total Categories: ${r.categories.length}`);
    for (const cat of r.categories) {
      console.log(`   - Category: ${cat.name} (${cat.dishes.length} dishes)`);
      for (const dish of cat.dishes.slice(0, 5)) {
        console.log(`      * ${dish.name} - ${Number(dish.price).toLocaleString('vi-VN')}₫`);
      }
      if (cat.dishes.length > 5) {
        console.log(`      * ... (+${cat.dishes.length - 5} more)`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
