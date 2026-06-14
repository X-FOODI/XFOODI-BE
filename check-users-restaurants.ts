import { prisma } from './src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    include: {
      roles: {
        include: {
          role: true,
          restaurant: true,
        }
      }
    }
  });
  console.log("=== USERS, ROLES, AND RESTAURANTS ===");
  users.forEach(u => {
    console.log(`User: ${u.fullName} (${u.email})`);
    u.roles.forEach(ur => {
      console.log(`  - Role: ${ur.role.name}, Restaurant: ${ur.restaurant?.name} (ID: ${ur.restaurant?.id})`);
    });
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
