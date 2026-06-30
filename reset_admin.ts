import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Admin@123', salt);

  const emailsToReset = [
    'admin-test@xfoodi.com',
    'xfoodiprojects@gmail.com',
    'thanhtrung8ctv@gmail.com'
  ];

  for (const email of emailsToReset) {
    await prisma.user.updateMany({
      where: { email },
      data: { passwordHash }
    });
    console.log(`Reset password for ${email} to 'Admin@123'`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
