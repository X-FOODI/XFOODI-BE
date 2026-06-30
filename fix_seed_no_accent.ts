import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function fix() {
  const apps = await p.restaurantApplication.findMany();
  for (const app of apps) {
    const id = app.id;
    // Extract number from slug
    const match = app.slug.match(/nhahangmau-(\d+)-/);
    let num = 1;
    if (match) num = parseInt(match[1]);
    
    // Using no accents to ensure safety across environments
    const newName = 'Nha Hang Mau ' + num + ' - ' + app.slug.split('-').pop();
    await p.restaurantApplication.update({
      where: { id },
      data: { restaurantName: newName }
    });
    console.log('Fixed', id, 'to', newName);
  }
  console.log('Done fixing encoding issues with no accents!');
}
fix().finally(() => p.$disconnect());
