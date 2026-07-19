import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking existing roles in Database...');
  const roles = await prisma.role.findMany();
  console.log('Roles:', roles);

  // Define required roles
  const requiredRoleNames = ['Admin', 'Customer', 'Owner'];

  // Ensure required roles exist in Roles table
  const roleMap: Record<string, string> = {};
  for (const rName of requiredRoleNames) {
    let existingRole = roles.find((r) => r.name.toLowerCase() === rName.toLowerCase());
    if (!existingRole) {
      existingRole = await prisma.role.create({
        data: { name: rName },
      });
      console.log(`✨ Created role: ${rName} (ID: ${existingRole.id})`);
    } else {
      console.log(`✅ Role exists: ${existingRole.name} (ID: ${existingRole.id})`);
    }
    roleMap[rName.toLowerCase()] = existingRole.id;
  }

  // Target accounts to seed
  const accounts = [
    {
      email: 'xfoodiprojects@gmail.com',
      userName: 'xfoodiprojects',
      fullName: 'XFoodi Admin',
      password: 'Thithithi@0305',
      roleName: 'Admin',
      phone: '0901111111',
    },
    {
      email: 'thihtktk@gmail.com',
      userName: 'thihtktk',
      fullName: 'Customer Thi',
      password: 'Thithithi@0305',
      roleName: 'Customer',
      phone: '0902222222',
    },
    {
      email: 'thihtktk03@gmail.com',
      userName: 'thihtktk03',
      fullName: 'Owner Thi',
      password: 'Thithithi@0305',
      roleName: 'Owner',
      phone: '0903333333',
    },
  ];

  for (const acc of accounts) {
    console.log(`\n----------------------------------------`);
    console.log(`👤 Processing account: ${acc.email} (${acc.roleName})...`);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(acc.password, salt);
    const roleId = roleMap[acc.roleName.toLowerCase()];

    // Check if user already exists (by email or username)
    // Note: check both exact email and scoped email (slug:email) if any
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: acc.email },
          { email: { endsWith: `:${acc.email}` } },
          { userName: acc.userName },
        ],
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    let userId: string;

    if (existingUser) {
      console.log(`🔄 Updating existing user (ID: ${existingUser.id})...`);
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: acc.email,
          userName: acc.userName,
          fullName: acc.fullName,
          passwordHash: passwordHash,
          phoneNumber: acc.phone,
          emailVerified: true,
          isActive: true,
          provider: 'local',
        },
      });
      userId = updatedUser.id;
      console.log(`✅ User info updated for: ${acc.email}`);
    } else {
      console.log(`✨ Creating new user: ${acc.email}...`);
      const newUser = await prisma.user.create({
        data: {
          email: acc.email,
          userName: acc.userName,
          fullName: acc.fullName,
          passwordHash: passwordHash,
          phoneNumber: acc.phone,
          emailVerified: true,
          isActive: true,
          provider: 'local',
        },
      });
      userId = newUser.id;
      console.log(`✅ User created (ID: ${userId})`);
    }

    // Ensure UserRole mapping
    const existingUserRole = await prisma.userRole.findFirst({
      where: {
        userId,
        roleId,
      },
    });

    if (!existingUserRole) {
      await prisma.userRole.create({
        data: {
          userId,
          roleId,
        },
      });
      console.log(`🔑 Assigned role "${acc.roleName}" to ${acc.email}`);
    } else {
      console.log(`🔑 Role "${acc.roleName}" already assigned to ${acc.email}`);
    }

    // If Customer role, ensure record in Customers table
    if (acc.roleName.toLowerCase() === 'customer') {
      const existingCustomer = await prisma.customer.findUnique({
        where: { userId },
      });
      if (!existingCustomer) {
        await prisma.customer.create({
          data: {
            userId,
            membershipLevel: 'BRONZE',
            loyaltyPoints: 0,
            isActive: true,
          },
        });
        console.log(`🛍️ Customer record created for ${acc.email}`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`🎉 Account seeding completed successfully!`);
}

main()
  .catch((e) => {
    console.error('❌ Error during account seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
