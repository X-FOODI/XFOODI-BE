import 'dotenv/config';
import axios from 'axios';

async function main() {
  const apiUrl = process.env.MISA_API_URL || '';
  const username = process.env.MISA_USERNAME || '';
  const password = process.env.MISA_PASSWORD || '';
  const taxCode = process.env.MISA_TAX_CODE || '2222222222-444';

  console.log('API URL:', apiUrl);

  // Test exact same as booca
  const url = `${apiUrl}/oauth`;
  const body = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  
  console.log('Body:', body);
  
  // Try different content types
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded']) {
    try {
      console.log('\nContent-Type:', ct);
      const response = await axios.post(url, body, {
        headers: { 'taxcode': taxCode, 'Content-Type': ct },
        validateStatus: () => true,
        timeout: 8000,
      });
      console.log('Status:', response.status);
      const d = typeof response.data === 'string' ? response.data.substring(0, 200) : JSON.stringify(response.data).substring(0, 200);
      console.log('Response:', d);
    } catch (e: any) {
      console.log('Error:', e.message);
    }
  }
}

main();
