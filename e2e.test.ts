import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('--- STARTING E2E VERIFICATION ---');
  let adminToken = '';
  let restaurantId = '';
  let ownerId = '';

  try {
    // 1. Get Admin Token and fetch lists
    console.log('[Test] Login Admin');
    const adminLogin = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin-test@xfoodi.com',
      password: 'Admin@123'
    });
    adminToken = adminLogin.data.data.accessToken;
    console.log('✅ Admin login success');

    const adminAxios = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    console.log('[Test] Fetching restaurants list via Admin API');
    const restaurantsRes = await adminAxios.get('/tenants/admin/list');
    const restaurants = restaurantsRes.data.data.items || restaurantsRes.data.data;
    const targetRest = restaurants.find((r: any) => r.id !== 'system');
    if (!targetRest) throw new Error('No testable restaurants found');
    restaurantId = targetRest.id;
    
    // Fetch ownerId from DB
    const restDbInfo = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restDbInfo || !restDbInfo.ownerId) throw new Error('Restaurant has no owner');
    ownerId = restDbInfo.ownerId;
    console.log(`✅ Fetched restaurant ${restaurantId} (Owner: ${ownerId})`);

    // 2. Disable Restaurant validation (< 10 chars)
    console.log('[Test] Disable Restaurant - Short Reason');
    try {
      await adminAxios.patch(`/admin/restaurants/${restaurantId}/disable`, { reason: 'short' });
      throw new Error('Should have failed validation');
    } catch (e: any) {
      if (e.response?.status === 400) console.log('✅ Validation <10 chars blocked');
      else throw e;
    }

    // 3. Disable Restaurant - Valid Reason
    console.log('[Test] Disable Restaurant - Valid Reason');
    await adminAxios.patch(`/admin/restaurants/${restaurantId}/disable`, { reason: 'This restaurant violated TOS heavily.' });
    console.log('✅ Restaurant disabled successfully');

    // 4. Verify in DB
    const dbRest = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (dbRest?.status === 'DISABLED' && dbRest.disabledReason) {
      console.log('✅ DB updated: status=DISABLED, disabledReason=' + dbRest.disabledReason);
    } else throw new Error('DB not updated');

    // Check AuditLog
    const logs = await prisma.auditLog.findMany({ where: { targetId: restaurantId }, orderBy: { createdAt: 'desc' } });
    if (logs.length > 0 && logs[0].action === 'RESTAURANT_DISABLED') {
      console.log('✅ AuditLog created for Restaurant Disable');
    } else throw new Error('AuditLog missing');

    // 5. Try login as owner of disabled restaurant
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    console.log('[Test] Login as Owner of Disabled Restaurant');
    let ownerToken = '';
    const ownerLogin = await axios.post(`${API_URL}/auth/login`, {
      email: owner?.email,
      password: 'Admin@123'
    });
    ownerToken = ownerLogin.data.data.accessToken;
    console.log('✅ Owner logged in successfully (since Owner is not globally banned yet)');
    
    console.log('[Test] Access Restaurant API via Owner Token');
    try {
      await axios.get(`${API_URL}/dashboard/restaurant/summary`, {
        headers: { Authorization: `Bearer ${ownerToken}`, 'X-Tenant-Domain': dbRest?.slug }
      });
      throw new Error('Should have been blocked due to disabled restaurant');
    } catch (e: any) {
      if (e.response?.status === 403 && e.response.data.message.toLowerCase().includes('disabled')) {
        console.log('✅ Access blocked by AuthMiddleware (403)');
      } else {
        console.log('Error:', e.response?.data);
        throw new Error('Auth middleware did not block');
      }
    }

    // 6. Enable Restaurant
    console.log('[Test] Enable Restaurant');
    await adminAxios.patch(`/admin/restaurants/${restaurantId}/enable`);
    console.log('✅ Restaurant enabled successfully');

    // 7. Access Restaurant API via Owner Token again
    console.log('[Test] Access Restaurant API after Enable');
    const enableCheck = await axios.get(`${API_URL}/dashboard/restaurant/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}`, 'X-Tenant-Domain': dbRest?.slug }
    });
    console.log('✅ Access granted (200 OK)');

    // 8. Disable User (owner)
    console.log('[Test] Disable User');
    await adminAxios.patch(`/admin/users/${ownerId}/disable`, { reason: 'User breached TOS continuously.' });
    console.log('✅ User disabled successfully');

    // 9. Try to login as Disabled User
    console.log('[Test] Login as Disabled User');
    try {
      await axios.post(`${API_URL}/auth/login`, {
        email: owner?.email,
        password: 'Admin@123'
      });
      throw new Error('Login should have been blocked');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✅ Login blocked at endpoint (403)');
      else throw e;
    }

    // 10. Test existing token block
    console.log('[Test] Access API with cached token of disabled user');
    try {
      await axios.get(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      throw new Error('Should have been blocked by middleware');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✅ Cached token blocked by AuthMiddleware (403)');
      else throw e;
    }

    // Restore User
    console.log('[Test] Restore User');
    await adminAxios.patch(`/admin/users/${ownerId}/enable`);
    console.log('✅ User restored');

    console.log('--- ALL E2E VERIFICATION PASSED ---');
  } catch (error: any) {
    console.error('--- TEST FAILED ---');
    console.error(error.message || error);
    if (error.response) console.error(error.response.data);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
