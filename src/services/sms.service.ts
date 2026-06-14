import twilio from 'twilio';
import { ENV } from '../config/env';

class SmsService {
  private client: twilio.Twilio | null = null;

  constructor() {
    const accountSid = ENV.TWILIO.ACCOUNT_SID;
    const authToken = ENV.TWILIO.AUTH_TOKEN;

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    } else {
      console.warn('⚠️ Warning: Twilio credentials are not set. SMS delivery will be bypassed.');
    }
  }

  async sendVerificationSms(to: string, code: string): Promise<void> {
    const from = ENV.TWILIO.PHONE_NUMBER;
    const body = `[XFoodi] Ma OTP xac thuc dang nhap cua ban la: ${code}. Hieu luc trong 5 phut.`;

    if (!this.client) {
      console.log(`[Twilio SMS Bypass] Sending verification code ${code} to ${to}`);
      return;
    }

    try {
      console.log(`[Twilio SMS] Sending SMS from ${from} to ${to}...`);
      const message = await this.client.messages.create({
        body,
        from,
        to,
      });
      console.log(`[Twilio SMS] SMS sent successfully. SID: ${message.sid}`);
    } catch (error: any) {
      console.error('❌ [Twilio SMS Failed] Twilio API error:', error.message || error);
      console.warn(`💡 [Twilio Fallback Mode] Twilio failed to deliver. For development/demo purposes, bypass by entering the generated OTP: ${code}`);
      // Do not throw the error, allowing the flow to succeed by reading OTP from the backend console.
    }
  }
}

export const smsService = new SmsService();
export default smsService;
