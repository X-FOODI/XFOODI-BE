import { PrismaClient } from '@prisma/client';
import { RAGService } from '../src/services/rag.service';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Finding a restaurant...');
    const restaurant = await prisma.restaurant.findFirst({
      select: { id: true, name: true }
    });
    
    if (!restaurant) {
      console.log('No restaurants found in database!');
      return;
    }
    
    console.log(`Found restaurant: ${restaurant.name} (ID: ${restaurant.id})`);
    
    console.log('Calling RAGService.queryRestaurant...');
    const result = await RAGService.queryRestaurant(
      restaurant.id,
      "Chào bạn, quán có những món gì ngon?",
      [],
      undefined,
      "kwjyaj6o4bnpvxmv8btcps" // session ID from user's request
    );
    
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error executing test:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
