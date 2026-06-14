import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const tables = ['Roles', 'UserRoles', 'Employees', 'Users', 'Restaurants'];
  for (const tbl of tables) {
    const rows: any[] = await (p as any).$queryRawUnsafe(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      tbl
    );
    console.log(`\n=== ${tbl} ===`);
    rows.forEach(r => console.log(`  ${r.column_name}  (${r.data_type}) ${r.is_nullable === 'NO' ? 'NOT NULL' : ''}`));
  }
  await (p as any).$disconnect();
})().catch(async (e: any) => {
  console.error('Error:', e.message);
  await (p as any).$disconnect();
  process.exit(1);
});
