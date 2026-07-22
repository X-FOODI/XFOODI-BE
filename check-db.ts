import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDB() {
  try {
    console.log('Checking database...');
    
    // Check restaurants
    const restaurants = await prisma.restaurant.count();
    console.log(`✓ Restaurants: ${restaurants}`);
    
    // Check users
    const users = await prisma.user.count();
    console.log(`✓ Users: ${users}`);
    
    // Check orders
    const orders = await prisma.order.count();
    console.log(`✓ Orders: ${orders}`);
    
    // Check tables
    const tables = await prisma.table.count();
    console.log(`✓ Tables: ${tables}`);
    
    console.log('\nDatabase seems OK. Data is still there.');
  } catch (error: any) {
    console.error('Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
