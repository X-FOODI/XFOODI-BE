import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      roles: {
        include: {
          role: true
        }
      }
    }
  });

  const admins = users.filter(u => u.roles.some(ur => ur.role.name === 'SuperAdmin' || ur.role.name === 'Admin' || ur.role.name === 'System Admin'));
  
  console.log('Admins found:');
  admins.forEach(a => {
    console.log(`Email/Username: ${a.email} | ${a.userName}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
