import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'trunganh222@gmail.com';
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      fullName: true,
      isActive: true,
      emailVerified: true,
      status: true,
      passwordHash: true,
      provider: true,
    },
  });

  if (!user) {
    console.log('❌ Không tìm thấy tài khoản');
  } else {
    console.log('Trạng thái tài khoản:');
    console.log(`  isActive      : ${user.isActive}`);
    console.log(`  emailVerified : ${user.emailVerified}`);
    console.log(`  status        : ${user.status}`);
    console.log(`  provider      : ${user.provider}`);
    console.log(`  Có passwordHash: ${!!user.passwordHash}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
