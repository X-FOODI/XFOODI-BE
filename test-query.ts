import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const restaurantId = '1bc7d0bb-f15b-408d-844b-018f832e16e3'; // Gao Beer
    const employees = await prisma.employee.findMany({
      where: { restaurantId },
      include: {
        user: {
          include: {
            roles: {
              where: { restaurantId },
              include: { role: true }
            }
          }
        }
      }
    });
    console.log('SUCCESS:', employees.length, 'employees found');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
