import { sendConfirmationEmail } from '../lib/email';
import { ENV } from '../config/env';

async function testSend() {
  console.log('Testing SendGrid API Key:', ENV.SENDGRID.API_KEY ? 'EXISTS' : 'MISSING');
  console.log('Sending test email to xfoodiprojects@gmail.com...');
  try {
    await sendConfirmationEmail('xfoodiprojects@gmail.com', 'test-token-123456');
    console.log('SUCCESS: Email sent successfully!');
  } catch (e: any) {
    console.error('ERROR: Failed to send email.');
    console.error(e?.response?.body || e);
  }
}

testSend();
