import 'dotenv/config';
import { misaService } from './src/services/misa.service';

async function main() {
  console.log('Testing MISA API...');
  console.log('API URL:', process.env.MISA_API_URL);
  console.log('Username:', process.env.MISA_USERNAME);
  console.log('Tax Code:', process.env.MISA_TAX_CODE);
  
  try {
    const result = await misaService.publishInvoice({
      referenceCode: 'TEST-001',
      totalAmount: 66000,
      description: 'Dịch vụ ăn uống nhà hàng - Test',
      companyName: 'Công ty TNHH Xeko Demo',
      taxId: '0312345678',
      address: '123 Nguyễn Văn Linh, Quận 7, TP.HCM',
      email: 'ketoan@xeko.com',
    });
    console.log('✅ SUCCESS:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('❌ FAILED:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response headers:', JSON.stringify(err.response.headers, null, 2));
      console.error('Response data (first 500 chars):', JSON.stringify(err.response.data).substring(0, 500));
    }
  }
}

main();
