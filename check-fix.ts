/**
 * Quick E2E check using PowerShell-friendly curl via node https
 */
import * as https from 'https';
import * as http from 'http';

function request(url: string, opts: any, body?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, opts, (res) => {
      let data = '';
      res.on('data', (c: any) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const BASE = 'http://localhost:5000';

  // 1. Login (bypass turnstile - check if it's disabled in dev)
  console.log('1. Login...');
  const loginBody = JSON.stringify({ email: 'owner-test@xfoodi.com', password: 'XFoodiPassword02', turnstileToken: 'dev' });
  const loginRes = await request(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginBody);

  console.log('   HTTP Status:', loginRes.status);
  const token = loginRes.data?.data?.accessToken;
  if (!token) {
    console.error('   Login FAILED. Response:', JSON.stringify(loginRes.data));
    return;
  }
  console.log('   Token OK:', token.substring(0, 40) + '...');

  // 2. GET /restaurants/me
  console.log('\n2. GET /restaurants/me...');
  const meRes = await request(`${BASE}/api/restaurants/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('   HTTP Status:', meRes.status);
  const restaurantId = meRes.data?.data?.id;
  console.log('   Restaurant:', meRes.data?.data?.name, '| ID:', restaurantId);

  // 3. GET /categories
  console.log('\n3. GET /categories?restaurantId=' + restaurantId);
  const catRes = await request(`${BASE}/api/categories?restaurantId=${restaurantId}&limit=50`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('   HTTP Status:', catRes.status);
  console.log('   Total:', catRes.data?.total);
  (catRes.data?.data ?? []).forEach((c: any) => {
    console.log(`   - [${c.isActive ? 'ACTIVE' : 'inactive'}] "${c.name}" (id: ${c.id})`);
  });
}

main().catch(console.error);
