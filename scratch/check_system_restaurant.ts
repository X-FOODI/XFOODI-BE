import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for System restaurant...');
  
  // Find system restaurant by slug
  let systemRestaurant = await prisma.restaurant.findUnique({
    where: { slug: 'system' }
  });

  if (systemRestaurant) {
    console.log('System restaurant already exists:', systemRestaurant);
    return;
  }

  // Find first user (preferably an Admin or SuperAdmin, otherwise any user)
  const firstUser = await prisma.user.findFirst();
  if (!firstUser) {
    console.error('No users found in database to assign as owner of the system restaurant!');
    return;
  }

  console.log(`Creating System restaurant owned by user: ${firstUser.email} (${firstUser.id})`);
  
  systemRestaurant = await prisma.restaurant.create({
    data: {
      id: 'system',
      name: 'Hệ thống XFoodi',
      slug: 'system',
      ownerId: firstUser.id,
      planType: 'PRO',
      description: 'Cơ sở tri thức hệ thống cho XFoodi Platform',
      address: 'Hệ thống',
      phone: '1900-1000',
      email: 'system@xfoodi.com',
      cuisineType: 'other',
      isActive: true
    }
  });

  console.log('System restaurant created successfully:', systemRestaurant);
}

main()
  .catch((e) => {
    console.error('Error in main:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
