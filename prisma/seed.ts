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
  console.log('🌱 Seed nhân viên mẫu (raw SQL)...\n');

  // ── 1. Thêm cột restaurantId vào Employees nếu chưa có ─────────────────────
  console.log('🔧 Đồng bộ schema bảng Employees...');
  await exec(`ALTER TABLE "Employees" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT`);
  // Cũng thêm createdDate nếu thiếu (NOT NULL với default)
  try {
    await exec(`ALTER TABLE "Employees" ADD COLUMN IF NOT EXISTS "createdDate" TIMESTAMP NOT NULL DEFAULT NOW()`);
  } catch (_) {}
  console.log('  ✅ Done.\n');

  // ── 2. Lấy nhà hàng đầu tiên ───────────────────────────────────────────────
  const rests = await qry(
    `SELECT id, name, slug FROM "Restaurants" WHERE "isActive" = true ORDER BY "createdAt" ASC LIMIT 1`
  );
  if (!rests.length) {
    console.error('❌ Không tìm thấy nhà hàng nào.');
    process.exit(1);
  }
  const rest = rests[0];
  const restaurantId = String(rest.id);
  const slug = String(rest.slug).toLowerCase();
  console.log(`✅ Nhà hàng: "${rest.name}" | slug: ${slug}\n`);

  // ── 3. Đảm bảo Role tồn tại ───────────────────────────────────────────────
  const roleNames = ['Waiter', 'Kitchen Staff', 'Cashier', 'Owner'];
  const roleMap: Record<string, string> = {};
  for (const roleName of roleNames) {
    const rows = await qry(`SELECT id FROM "Roles" WHERE name = $1 LIMIT 1`, roleName);
    if (rows.length > 0) {
      roleMap[roleName] = String(rows[0].id);
    } else {
      const newId = randomUUID();
      await exec(`INSERT INTO "Roles" (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, newId, roleName);
      const inserted = await qry(`SELECT id FROM "Roles" WHERE name = $1 LIMIT 1`, roleName);
      roleMap[roleName] = String(inserted[0].id);
      console.log(`  + Role tạo mới: "${roleName}"`);
    }
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

    // Kiểm tra User đã tồn tại chưa
    const existingUser = await qry(
      `SELECT id FROM "Users" WHERE email = $1 OR "userName" = $2 LIMIT 1`,
      scopedEmail, scopedUsername
    );
    if (existingUser.length > 0) {
      console.log(`  ⚠️  Bỏ qua (đã tồn tại): ${emp.fullName}`);
      skipped++;
      continue;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(PASSWORD, salt);
    const userId     = randomUUID();
    const employeeId = randomUUID();
    const now = new Date();

    // INSERT Users (dùng createdDate vì NOT NULL, createdAt có thể nullable)
    await exec(
      `INSERT INTO "Users" (
        id, email, "userName", "passwordHash", "fullName", "phoneNumber",
        "emailVerified", "isActive", provider,
        "twoFactorEnabled", "twoFactorBackupCodes",
        "createdDate", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6, true,true,'local', false,ARRAY[]::text[], $7,$7,$7)`,
      userId, scopedEmail, scopedUsername, passwordHash,
      emp.fullName, emp.phone, now
    );

    // INSERT UserRoles
    await exec(
      `INSERT INTO "UserRoles" ("userId","roleId","restaurantId")
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      userId, roleMap[emp.role], restaurantId
    );

    // Kiểm tra code trùng
    const codeRows = await qry(
      `SELECT id FROM "Employees" WHERE code = $1 AND "restaurantId" = $2 LIMIT 1`,
      emp.code, restaurantId
    );
    const finalCode = codeRows.length > 0 ? `${emp.code}-${Date.now()}` : emp.code;

    // INSERT Employees
    await exec(
      `INSERT INTO "Employees" (
        id, code, "restaurantId", "userId", position,
        "hireDate", salary, "salaryType", "isActive",
        "createdDate", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5, $6::date, 0,'MONTHLY',true, $7,$7,$7)`,
      employeeId, finalCode, restaurantId, userId,
      emp.position, now, now
    );

    console.log(`  ✅ [${emp.code}] ${emp.fullName} | ${emp.role} | TK: ${emp.username}`);
    created++;
  }

  console.log(`\n🎉 Seed xong! Tạo: ${created} | Bỏ qua: ${skipped}`);
  console.log(`\n📋 Thông tin đăng nhập nhân viên:`);
  console.log(`   Username: "${slug}:nvan.an"   (format: slug:username)`);
  console.log(`   Mật khẩu: ${PASSWORD}`);
}

main()
  .then(() => (p as any).$disconnect())
  .catch(async (e: any) => {
    console.error('\n❌ Lỗi:', e.message || e);
    await (p as any).$disconnect();
    process.exit(1);
  });
