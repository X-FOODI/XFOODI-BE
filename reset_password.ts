import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const emails = [
    'thanhtrung8ctv@gmail.com', 
    'admin-test@xfoodi.com', 
    'xfoodiprojects@gmail.com'
  ];
  
  const newPassword = 'Admin@123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  console.log(`Resetting passwords to: ${newPassword}`);
  
  for (const email of emails) {
    const updatedUser = await prisma.user.updateMany({
      where: { email },
      data: { passwordHash }
    });
    console.log(`Updated ${updatedUser.count} user(s) with email ${email}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
