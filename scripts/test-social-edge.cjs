require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}/api/social`;

async function main() {
  const p = new PrismaClient();
  const u = await p.user.findFirst({ where: { isActive: true } });
  const token = jwt.sign({ jti: 'edge', sub: u.id, email: u.email }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
  });
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const cases = [
    ['empty content', () => fetch(`${BASE}/posts`, { method: 'POST', headers: h, body: JSON.stringify({ content: '  ' }) })],
    ['bad reaction type', () =>
      fetch(`${BASE}/reactions`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ postId: '00000000-0000-0000-0000-000000000001', type: 'ANGRY' }),
      })],
    ['bad mention', () =>
      fetch(`${BASE}/posts`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ content: 'hello @nonexistent_user_xyz_999' }),
      })],
    ['invalid cursor', () => fetch(`${BASE}/posts?cursor=not-valid`, { headers: h })],
  ];

  for (const [name, fn] of cases) {
    const res = await fn();
    const body = await res.json();
    console.log(`${name}: HTTP ${res.status} — ${body.message || body.success}`);
  }

  await p.$disconnect();
}

main();
