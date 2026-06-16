import sgMail from '@sendgrid/mail';
import { ENV } from '../config/env';

// Configure SendGrid API Key
if (ENV.SENDGRID.API_KEY) {
  sgMail.setApiKey(ENV.SENDGRID.API_KEY);
}

/**
 * Sends a password reset OTP to the specified email address using SendGrid.
 * Falls back to logging the OTP to the console if SendGrid is not configured.
 * 
 * @param to - Recipient email address
 * @param otp - The OTP code
 */
export const sendResetPasswordOtp = async (to: string, otp: string): Promise<void> => {
  const emailFrom = ENV.SENDGRID.EMAIL_FROM || 'no-reply@xfoodi.com';
  const emailFromName = ENV.SENDGRID.EMAIL_FROM_NAME || 'XFoodi Support';
  
  const msg = {
    to: to.toLowerCase(),
    from: {
      email: emailFrom,
      name: emailFromName,
    },
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: `XFoodi Password Reset Verification Code: ${otp}`,
    text: `Your password reset verification code is: ${otp}. This code will expire in 10 minutes.`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">
        <div style="text-align: center; margin-bottom: 35px; border-bottom: 2px solid #f8f9fa; padding-bottom: 20px;">
          <h1 style="color: #ff380b; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.5px;">X-FOODI</h1>
          <p style="color: #6c757d; margin: 5px 0 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px;">Password Recovery</p>
        </div>
        
        <div style="padding: 10px 0;">
          <h2 style="color: #2b2b2b; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px;">Hello,</h2>
          <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
            We received a request to reset the password for your XFoodi account. Use the verification code below to proceed with setting up a new password:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: linear-gradient(135deg, #ff380b, #ff6c00); color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 10px rgba(255, 56, 11, 0.25);">
              ${otp}
            </div>
          </div>
          
          <p style="color: #e53e3e; font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; margin-bottom: 30px;">
            ⚠️ This code is valid for 10 minutes. Do not share it with anyone.
          </p>
          
          <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
            If you did not request a password reset, please ignore this email. Your password will remain unchanged, and your account is secure.
          </p>
        </div>
        
        <div style="margin-top: 40px; padding-top: 25px; border-top: 1px solid #edf2f7; text-align: center; color: #a0aec0; font-size: 12px; line-height: 1.5;">
          <p style="margin: 0 0 5px 0;">This is an automated system email. Please do not reply directly.</p>
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} X-Foodi. All rights reserved.</p>
        </div>
      </div>
    `,
  };

  try {
    if (!ENV.SENDGRID.API_KEY) {
      console.log(`\n========================================`);
      console.log(`[MOCK EMAIL] SendGrid API Key not configured!`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${msg.subject}`);
      console.log(`Verification Code (OTP): ${otp}`);
      console.log(`========================================\n`);
      return;
    }

    await sgMail.send(msg);
    console.log(`[MailService] Reset password OTP email sent successfully to ${to}`);
  } catch (error) {
    console.error(`[MailService] Failed to send email to ${to}`, error);
    // Graceful console fallback for invalid keys in development environment
    if (error && (error as any).code === 401) {
      console.log(`\n========================================`);
      console.log(`[MOCK EMAIL FALLBACK - API Key Invalid]`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${msg.subject}`);
      console.log(`Verification Code (OTP): ${otp}`);
      console.log(`========================================\n`);
    } else {
      throw error;
    }
  }
};
