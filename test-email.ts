import { sendConfirmationEmail } from './src/lib/email';

async function main() {
  console.log('Sending test email to trunganh222@gmail.com...');
  try {
    await sendConfirmationEmail('trunganh222@gmail.com', 'test-token-123');
    console.log('✅ Email sent successfully!');
  } catch (err: any) {
    console.error('❌ Email failed:', err?.response?.body || err?.message || err);
  }
}

main();
