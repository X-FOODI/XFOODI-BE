import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:5000/api';

async function runTests() {
  const email = 'admin-test@xfoodi.com';
  let password = 'NewPassword!123';
  const newPassword = 'Admin@123';
  let accessToken = '';

  console.log('--- TEST 1: Login ---');
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email,
      password,
      turnstileToken: 'dummy-token'
    }, {
      headers: {
        'x-tenant-domain': 'admin.xfoodi.website'
      }
    });
    
    accessToken = loginRes.data.data?.accessToken || loginRes.data.tokens?.accessToken;
    console.log('✅ Login successful');
  } catch (err: any) {
    console.error('❌ Login failed:', JSON.stringify(err.response?.data || err.message));
    return;
  }

  const headers = { 
    Authorization: `Bearer ${accessToken}`,
    'x-tenant-domain': 'admin.xfoodi.website'
  };

  console.log('\n--- TEST 3: Change Password ---');
  try {
    const cpRes = await axios.put(`${BASE_URL}/users/change-password`, {
      currentPassword: password,
      newPassword: newPassword,
      confirmPassword: newPassword
    }, { headers });
    console.log('✅ Change Password successful (reverted to Admin@123)');
  } catch (err: any) {
    console.error('❌ Change Password failed:', JSON.stringify(err.response?.data || err.message));
    return;
  }
}

runTests();
