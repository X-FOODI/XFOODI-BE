import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'duchuy180205@gmail.com';
  console.log(`=== Khởi động script liên kết tài khoản: ${email} ===`);

  // 1. Tìm hoặc tạo User
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email },
        { userName: email }
      ]
    }
  });

  if (user) {
    console.log(`✅ Tìm thấy user trong DB: id = ${user.id}, email = ${user.email}`);
  } else {
    console.log(`ℹ️ Không tìm thấy user. Tiến hành tạo mới...`);
    user = await prisma.user.create({
      data: {
        email: email,
        userName: email,
        fullName: 'Huy Duc',
        emailVerified: true,
        isActive: true,
        provider: 'google',
      }
    });
    console.log(`✅ Tạo mới user thành công: id = ${user.id}`);
  }

  // 2. Tìm hoặc tạo Restaurant
  let restaurant = await prisma.restaurant.findFirst({
    orderBy: { createdAt: 'asc' }
  });

  if (restaurant) {
    console.log(`✅ Tìm thấy nhà hàng có sẵn: id = ${restaurant.id}, name = ${restaurant.name}, slug = ${restaurant.slug}`);
    // Đảm bảo ownerId của nhà hàng trỏ tới user này nếu chưa có owner hợp lệ
    if (restaurant.ownerId !== user.id) {
      console.log(`ℹ️ Cập nhật Owner của nhà hàng thành user hiện tại...`);
      restaurant = await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { ownerId: user.id }
      });
      console.log(`✅ Đã cập nhật Owner của nhà hàng.`);
    }
  } else {
    console.log(`ℹ️ Không tìm thấy nhà hàng nào trong hệ thống. Tiến hành tạo mới nhà hàng demo...`);
    restaurant = await prisma.restaurant.create({
      data: {
        name: 'XFoodi Demo Restaurant',
        slug: 'xfoodi-demo',
        ownerId: user.id,
        isActive: true,
        planType: 'PREMIUM',
      }
    });
    console.log(`✅ Tạo mới nhà hàng demo thành công: id = ${restaurant.id}, slug = ${restaurant.slug}`);
  }

  // 3. Đảm bảo Role "Owner" tồn tại
  let role = await prisma.role.findUnique({
    where: { name: 'Owner' }
  });

  if (!role) {
    console.log(`ℹ️ Không tìm thấy role "Owner". Tiến hành tạo mới...`);
    role = await prisma.role.create({
      data: { name: 'Owner' }
    });
    console.log(`✅ Tạo mới role "Owner" thành công: id = ${role.id}`);
  } else {
    console.log(`✅ Role "Owner" đã tồn tại: id = ${role.id}`);
  }

  // 4. Đảm bảo phân quyền UserRole liên kết User với Role Owner tại Restaurant đó
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId: user.id,
      roleId: role.id
    }
  });

  if (userRole) {
    console.log(`✅ Phân quyền UserRole đã tồn tại.`);
    if (userRole.restaurantId !== restaurant.id) {
      console.log(`ℹ️ Cập nhật restaurantId của UserRole sang nhà hàng hiện tại...`);
      await prisma.userRole.update({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: role.id
          }
        },
        data: {
          restaurantId: restaurant.id
        }
      });
      console.log(`✅ Đã cập nhật restaurantId của UserRole.`);
    }
  } else {
    console.log(`ℹ️ Phân quyền UserRole chưa có. Tiến hành liên kết...`);
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        restaurantId: restaurant.id
      }
    });
    console.log(`✅ Đã liên kết UserRole (User làm Owner của nhà hàng ${restaurant.name}).`);
  }

  console.log(`\n🎉 HOÀN THÀNH LIÊN KẾT THÀNH CÔNG!`);
  console.log(`   - Tài khoản của bạn: ${email}`);
  console.log(`   - Nhà hàng quản lý: ${restaurant.name} (Slug: ${restaurant.slug})`);
  console.log(`   - Vai trò: Owner (Quản trị viên nhà hàng)`);
  console.log(`\n👉 Hướng dẫn tiếp theo:`);
  console.log(`   1. Đăng nhập lại qua Google Auth trên Frontend.`);
  console.log(`   2. Hệ thống sẽ nhận dạng đúng User và Restaurant ID của bạn để mở khoá tính năng.`);
}

main()
  .catch((e) => {
    console.error(`❌ Lỗi trong quá trình thực thi:`, e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
