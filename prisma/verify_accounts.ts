import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: ['xfoodiprojects@gmail.com', 'thihtktk@gmail.com', 'thihtktk03@gmail.com'],
      },
    },
    include: {
      roles: { include: { role: true } },
    },
  });

  console.log('📌 Verification Results:');
  for (const u of users) {
    const isMatch = await bcrypt.compare('Thithithi@0305', u.passwordHash || '');
    const rolesList = u.roles.map((r) => r.role.name).join(', ');
    console.log(`✅ User: ${u.email} | Roles: [${rolesList}] | Password Verification: ${isMatch ? 'PASS ✅' : 'FAIL ❌'}`);
  }
}

main().finally(() => prisma.$disconnect());
