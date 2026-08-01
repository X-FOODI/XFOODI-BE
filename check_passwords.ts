import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: ['thanhtrung8ctv@gmail.com', 'admin-test@xfoodi.com', 'xfoodiprojects@gmail.com']
      }
    },
    select: {
      email: true,
      passwordHash: true
    }
  });

  console.log(users.map(u => ({ email: u.email, hasPassword: !!u.passwordHash })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
