/**
 * Smoke test: image upload + post with image
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}/api/social`;

async function main() {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw new Error('No active user');

  const token = jwt.sign(
    {
      jti: `test-upload-${Date.now()}`,
      sub: user.id,
      email: user.email,
      role: 'Customer',
      nameid: user.id,
      unique_name: user.email,
      fullName: user.fullName,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const auth = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  const uploadRes = await fetch(`${BASE}/media/upload`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      files: [{ base64: png.toString('base64'), mimeType: 'image/png' }],
    }),
  });
  const uploadBody = await uploadRes.json();
  console.log('UPLOAD', uploadRes.status, uploadBody);

  if (!uploadRes.ok) {
    process.exit(1);
  }

  const url = uploadBody.data?.urls?.[0];
  if (!url) {
    console.error('No URL returned');
    process.exit(1);
  }

  const postRes = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      content: `Image post test #xfoodi ${new Date().toISOString()}`,
      imageUrls: [url],
    }),
  });
  const postBody = await postRes.json();
  console.log('POST', postRes.status, { id: postBody.data?.id, images: postBody.data?.images });

  if (postRes.ok && postBody.data?.id) {
    await fetch(`${BASE}/posts/${postBody.data.id}`, { method: 'DELETE', headers: auth });
    console.log('Cleanup OK');
  }

  await prisma.$disconnect();
  process.exit(postRes.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
