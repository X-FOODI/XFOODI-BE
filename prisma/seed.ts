/**
 * Seed Script – Thêm nhân viên mẫu dựa theo cấu trúc DB thực tế
 * Chạy: npx ts-node prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const p = new PrismaClient();

const qry = (sql: string, ...params: any[]): Promise<any[]> =>
  (p as any).$queryRawUnsafe(sql, ...params);

const exec = (sql: string, ...params: any[]): Promise<any> =>
  (p as any).$executeRawUnsafe(sql, ...params);

async function main() {
  console.log('🌱 Seed dữ liệu mẫu (raw SQL)...\n');

  // ══════════════════════════════════════════════════════════════════════════
  // ── PHẦN A: Seed tài khoản Admin (SuperAdmin) — KHÔNG phụ thuộc restaurant
  // ══════════════════════════════════════════════════════════════════════════
  console.log('👤 Seed tài khoản Admin...');

  const ADMIN_EMAIL = 'xfoodiprojects@gmail.com';
  const ADMIN_PASSWORD = 'Admin@123';
  const ADMIN_NAME = 'System Admin';

  // Đảm bảo role Admin tồn tại
  const adminRole = await p.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin' },
  });
  console.log(`  + Role: "Admin" (${adminRole.id})`);
  const adminRoleId = adminRole.id;

  // Kiểm tra admin user đã tồn tại chưa
  const existingAdmin = await p.user.findFirst({
    where: { email: ADMIN_EMAIL }
  });

  let adminUserId: string;

  if (existingAdmin) {
    adminUserId = existingAdmin.id;
    console.log(`  ⚠️  Admin đã tồn tại: ${ADMIN_EMAIL}`);
  } else {
    const adminSalt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, adminSalt);

    const newUser = await p.user.create({
      data: {
        email: ADMIN_EMAIL,
        userName: ADMIN_EMAIL,
        passwordHash: adminPasswordHash,
        fullName: ADMIN_NAME,
        emailVerified: true,
        isActive: true,
        provider: 'local',
        twoFactorEnabled: false,
        twoFactorBackupCodes: [],
      }
    });
    adminUserId = newUser.id;
    console.log(`  ✅ Admin tạo thành công: ${ADMIN_EMAIL}`);
  }

  // Luôn đảm bảo role Admin được gán
  await p.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUserId,
        roleId: adminRoleId,
      }
    },
    update: {},
    create: {
      userId: adminUserId,
      roleId: adminRoleId,
    }
  });

  console.log(`  🔑 Admin:  Email: ${ADMIN_EMAIL}  |  Mật khẩu: ${ADMIN_PASSWORD}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // ── PHẦN B: Seed nhân viên mẫu — CẦN có restaurant
  // ══════════════════════════════════════════════════════════════════════════

  // ── B1. Thêm cột restaurantId vào Employees nếu chưa có ────────────────
  console.log('🔧 Đồng bộ schema bảng Employees...');
  await exec(`ALTER TABLE "Employees" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT`);
  try {
    await exec(`ALTER TABLE "Employees" ADD COLUMN IF NOT EXISTS "createdDate" TIMESTAMP NOT NULL DEFAULT NOW()`);
  } catch (_) {}
  console.log('  ✅ Done.\n');

  // ── B2. Lấy nhà hàng đầu tiên ─────────────────────────────────────────
  const rests = await qry(
    `SELECT id, name, slug FROM "Restaurants" WHERE "isActive" = true ORDER BY "createdAt" ASC LIMIT 1`
  );
  if (!rests.length) {
    console.warn('⚠️  Không tìm thấy nhà hàng nào — bỏ qua seed nhân viên.');
    console.log('\n🎉 Seed hoàn tất (chỉ admin)!');
    return;
  }
  const rest = rests[0];
  const restaurantId = String(rest.id);
  const slug = String(rest.slug).toLowerCase();
  console.log(`✅ Nhà hàng: "${rest.name}" | slug: ${slug}\n`);

  // ── 3. Đảm bảo Role tồn tại ───────────────────────────────────────────────
  const roleNames = ['Waiter', 'Kitchen Staff', 'Cashier', 'Owner'];
  const roleMap: Record<string, string> = {};
  for (const roleName of roleNames) {
    const role = await p.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    roleMap[roleName] = role.id;
    console.log(`  + Role: "${roleName}"`);
  }
  console.log('');

  // ── 4. Dữ liệu nhân viên mẫu ──────────────────────────────────────────────
  const seedEmployees = [
    { fullName: 'Nguyễn Văn An',   username: 'nvan.an',   email: 'nvan.an@gmail.com',   phone: '0901234567', role: 'Waiter',        position: 'Nhân viên phục vụ',   code: 'EMP-001' },
    { fullName: 'Trần Thị Bình',   username: 'tthi.binh', email: 'tthi.binh@gmail.com', phone: '0912345678', role: 'Kitchen Staff', position: 'Nhân viên bếp chính', code: 'EMP-002' },
    { fullName: 'Lê Hoàng Cường',  username: 'lh.cuong',  email: 'lh.cuong@gmail.com',  phone: '0923456789', role: 'Cashier',       position: 'Thu ngân',            code: 'EMP-003' },
    { fullName: 'Phạm Minh Dương', username: 'pm.duong',  email: 'pm.duong@gmail.com',  phone: '0934567890', role: 'Waiter',        position: 'Trưởng ca phục vụ',   code: 'EMP-004' },
    { fullName: 'Hoàng Thị Lan',   username: 'ht.lan',    email: 'ht.lan@gmail.com',    phone: '0945678901', role: 'Kitchen Staff', position: 'Phụ bếp',             code: 'EMP-005' },
  ];

  const PASSWORD = 'Password@123';
  let created = 0, skipped = 0;

  for (const emp of seedEmployees) {
    const scopedEmail    = `${slug}:${emp.email}`;
    const scopedUsername = `${slug}:${emp.username}`;

    const existingUser = await p.user.findFirst({
      where: {
        OR: [
          { email: scopedEmail },
          { userName: scopedUsername }
        ]
      }
    });

    if (existingUser) {
      console.log(`  ⚠️  Bỏ qua (đã tồn tại): ${emp.fullName}`);
      skipped++;
      continue;
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(PASSWORD, salt);

      const newUser = await p.user.create({
        data: {
          email: scopedEmail,
          userName: scopedUsername,
          passwordHash: passwordHash,
          fullName: emp.fullName,
          phoneNumber: emp.phone,
          emailVerified: true,
          isActive: true,
          provider: 'local',
          twoFactorEnabled: false,
          twoFactorBackupCodes: [],
        }
      });

      const roleId = roleMap[emp.role];
      if (!roleId) {
        console.error(`  ❌ Không tìm thấy roleId cho role: ${emp.role}`);
        skipped++;
        continue;
      }

      await p.userRole.upsert({
        where: {
          userId_roleId: {
            userId: newUser.id,
            roleId: roleId,
          }
        },
        update: {},
        create: {
          userId: newUser.id,
          roleId: roleId,
          restaurantId: restaurantId
        }
      });

      // Handle duplicate code
      const codeRows = await p.employee.findFirst({
        where: { code: emp.code, restaurantId: restaurantId }
      });
      const finalCode = codeRows ? `${emp.code}-${Date.now()}` : emp.code;

      await p.employee.create({
        data: {
          code: finalCode,
          restaurantId: restaurantId,
          userId: newUser.id,
          position: emp.position,
          hireDate: new Date(),
          salary: 0,
          salaryType: 'MONTHLY',
          isActive: true,
        }
      });

      console.log(`  ✅ [${emp.code}] ${emp.fullName} | ${emp.role} | TK: ${emp.username}`);
      created++;
    } catch (err: any) {
      console.error(`  ❌ Lỗi tạo ${emp.fullName}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n🎉 Seed hoàn tất! Nhân viên tạo: ${created} | Bỏ qua: ${skipped}`);
  console.log(`\n📋 Thông tin đăng nhập:`);
  console.log(`   🔑 Admin:    Email: ${ADMIN_EMAIL}  |  Mật khẩu: ${ADMIN_PASSWORD}`);
  console.log(`   👷 Nhân viên: Username: "${slug}:nvan.an"  |  Mật khẩu: ${PASSWORD}`);
}

main()
  .then(() => (p as any).$disconnect())
  .catch(async (e: any) => {
    console.error('\n❌ Lỗi:', e.message || e);
    await (p as any).$disconnect();
    process.exit(1);
  });
