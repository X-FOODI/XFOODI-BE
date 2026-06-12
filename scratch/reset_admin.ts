import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const emailArg = process.argv[2];
  const newPasswordArg = process.argv[3];

  if (emailArg && newPasswordArg) {
    const targetEmail = emailArg.trim().toLowerCase();
    console.log(`Connecting to database and seeking user: "${targetEmail}"...`);

    // Let's support querying by exact email, or by prefix, or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: targetEmail },
          { email: `local:${targetEmail}` },
          { userName: targetEmail }
        ]
      }
    });

    if (!user) {
      console.error(`❌ Error: User "${emailArg}" not found in database!`);
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPasswordArg, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash }
    });

    console.log(`\n✅ Success: Password for user "${user.email}" (${user.fullName || 'No Name'}) has been successfully updated.`);
    console.log(`🔑 New Password: "${newPasswordArg}"`);
    return;
  }

  console.log('--- SYSTEM USER DIRECTORY ---');
  const users = await prisma.user.findMany({
    include: {
      roles: {
        include: {
          role: true
        }
      }
    }
  });

  if (users.length === 0) {
    console.log('No users found in database.');
  } else {
    users.forEach((u) => {
      const roles = u.roles.map((r) => r.role.name).join(', ');
      console.log(`- Email: ${u.email} | Name: ${u.fullName} | Username: ${u.userName} | Roles: [${roles}]`);
    });
  }

  console.log('\n💡 Usage to Reset Password:');
  console.log('npx ts-node scratch/reset_admin.ts <email> <new_password>');
}

main()
  .catch((e) => {
    console.error('❌ Error executing script:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
