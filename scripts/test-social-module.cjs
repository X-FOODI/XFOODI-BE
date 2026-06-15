/**
 * Smoke test: Social / Blog API (requires server running on PORT)
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}/api/social`;
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`✓ ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`✗ ${label}`, detail || '');
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

async function main() {
  if (!process.env.JWT_ACCESS_SECRET) {
    console.error('JWT_ACCESS_SECRET missing');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, email: true, userName: true, fullName: true },
  });

  if (!user) {
    console.error('No active user in DB');
    process.exit(1);
  }

  const token = jwt.sign(
    {
      jti: `test-social-${Date.now()}`,
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

  console.log('Testing as:', user.email, '\n');

  // 1. List posts (public)
  const listRes = await fetch(`${BASE}/posts?limit=5`, { headers: auth });
  const listBody = await json(listRes);
  if (listRes.ok && listBody.success && listBody.data?.items) {
    ok('GET /posts');
  } else {
    fail('GET /posts', { status: listRes.status, listBody });
  }

  // 2. Create post
  const createRes = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      content: `Smoke test post #xfoodi ${new Date().toISOString()}`,
      imageUrls: [],
    }),
  });
  const createBody = await json(createRes);
  const postId = createBody.data?.id;

  if (createRes.status === 201 && createBody.success && postId) {
    ok('POST /posts');
  } else {
    fail('POST /posts', { status: createRes.status, createBody });
    await prisma.$disconnect();
    process.exit(1);
  }

  // 3. Get post by id
  const getRes = await fetch(`${BASE}/posts/${postId}`, { headers: auth });
  const getBody = await json(getRes);
  if (getRes.ok && getBody.data?.id === postId) {
    ok('GET /posts/:id');
  } else {
    fail('GET /posts/:id', { status: getRes.status, getBody });
  }

  // 4. Update post
  const patchRes = await fetch(`${BASE}/posts/${postId}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ content: 'Updated smoke test #xfoodi' }),
  });
  const patchBody = await json(patchRes);
  if (patchRes.ok && patchBody.data?.content?.includes('Updated')) {
    ok('PATCH /posts/:id');
  } else {
    fail('PATCH /posts/:id', { status: patchRes.status, patchBody });
  }

  // 5. Comment
  const commentRes = await fetch(`${BASE}/comments`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ postId, content: 'Nice post!' }),
  });
  const commentBody = await json(commentRes);
  const commentId = commentBody.data?.id;

  if (commentRes.status === 201 && commentId) {
    ok('POST /comments');
  } else {
    fail('POST /comments', { status: commentRes.status, commentBody });
  }

  // 6. Reaction
  const reactRes = await fetch(`${BASE}/reactions`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ postId, type: 'LIKE' }),
  });
  const reactBody = await json(reactRes);
  if (reactRes.ok && reactBody.data?.type === 'LIKE') {
    ok('POST /reactions (add)');
  } else {
    fail('POST /reactions', { status: reactRes.status, reactBody });
  }

  // 7. Toggle reaction off
  const reactOffRes = await fetch(`${BASE}/reactions`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ postId, type: 'LIKE' }),
  });
  const reactOffBody = await json(reactOffRes);
  if (reactOffRes.ok && reactOffBody.data?.action === 'removed') {
    ok('POST /reactions (toggle off)');
  } else {
    fail('POST /reactions toggle', { status: reactOffRes.status, reactOffBody });
  }

  // 8. Share
  const shareRes = await fetch(`${BASE}/share/${postId}`, { method: 'POST', headers: auth });
  const shareBody = await json(shareRes);
  if (shareRes.status === 201 && shareBody.success) {
    ok('POST /share/:postId');
  } else {
    fail('POST /share/:postId', { status: shareRes.status, shareBody });
  }

  // 9. Save toggle
  const saveRes = await fetch(`${BASE}/save/${postId}`, { method: 'POST', headers: auth });
  const saveBody = await json(saveRes);
  if (saveRes.ok && saveBody.data?.saved === true) {
    ok('POST /save/:postId (save)');
  } else {
    fail('POST /save/:postId', { status: saveRes.status, saveBody });
  }

  const unsaveRes = await fetch(`${BASE}/save/${postId}`, { method: 'POST', headers: auth });
  const unsaveBody = await json(unsaveRes);
  if (unsaveRes.ok && unsaveBody.data?.saved === false) {
    ok('POST /save/:postId (unsave)');
  } else {
    fail('POST /save/:postId unsave', { status: unsaveRes.status, unsaveBody });
  }

  // 10. Hashtag filter
  const tagRes = await fetch(`${BASE}/posts?hashtag=xfoodi&limit=5`, { headers: auth });
  const tagBody = await json(tagRes);
  const hasTagged = tagBody.data?.items?.some((p) => p.hashtags?.includes('xfoodi'));
  if (tagRes.ok && hasTagged) {
    ok('GET /posts?hashtag=xfoodi');
  } else {
    fail('GET /posts?hashtag=xfoodi', { status: tagRes.status, count: tagBody.data?.items?.length });
  }

  // 11. Unauthorized
  const unauthRes = await fetch(`${BASE}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (unauthRes.status === 401) {
    ok('POST /posts without token → 401');
  } else {
    fail('Unauthorized check', { status: unauthRes.status });
  }

  // 12. Cleanup comment + post
  if (commentId) {
    const delCommentRes = await fetch(`${BASE}/comments/${commentId}`, { method: 'DELETE', headers: auth });
    if (delCommentRes.ok) ok('DELETE /comments/:id');
    else fail('DELETE /comments/:id', { status: delCommentRes.status });
  }

  const delPostRes = await fetch(`${BASE}/posts/${postId}`, { method: 'DELETE', headers: auth });
  if (delPostRes.ok) ok('DELETE /posts/:id');
  else fail('DELETE /posts/:id', { status: delPostRes.status });

  // DB tables exist
  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('SocialPosts','SocialComments','SocialReactions')
  `;
  if (tables.length >= 3) {
    ok('DB tables SocialPosts, SocialComments, SocialReactions exist');
  } else {
    fail('DB tables check', tables);
  }

  await prisma.$disconnect();

  console.log(`\n--- Result: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
