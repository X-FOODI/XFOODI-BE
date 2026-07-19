import { centralPrisma } from './lib/prisma';

async function main() {
  console.log("Users in Gạo Beer:");
  const userRoles = await centralPrisma.userRole.findMany({
    where: { restaurantId: '1bc7d0bb-f15b-408d-844b-018f832e16e3' },
    include: {
      user: {
        select: { id: true, email: true, fullName: true }
      },
      role: {
        select: { name: true }
      }
    }
  });
  console.log(JSON.stringify(userRoles, null, 2));

  console.log("\nRestaurants details:");
  const rest = await centralPrisma.restaurant.findUnique({
    where: { id: '1bc7d0bb-f15b-408d-844b-018f832e16e3' }
  });
  console.log(rest);
}

main().catch(console.error);


