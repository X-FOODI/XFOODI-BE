import sgMail from '@sendgrid/mail';
import { ENV } from '../config/env';

// Make sure API key exists before setting it
if (ENV.SENDGRID.API_KEY) {
  sgMail.setApiKey(ENV.SENDGRID.API_KEY);
}

export const sendConfirmationEmail = async (email: string, token: string) => {
  const confirmationUrl = `http://localhost:3000/confirm-email?token=${token}`;
  
  const msg = {
    to: email,
    from: {
      email: ENV.SENDGRID.EMAIL_FROM || 'no-reply@xfoodi.com',
      name: ENV.SENDGRID.EMAIL_FROM_NAME || 'XFoodi',
    },
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: 'Confirm Your XFoodi Account',
    text: `Please confirm your email by clicking the following link: ${confirmationUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ff380b;">Welcome to XFoodi!</h2>
        <p>Thank you for registering. Please confirm your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmationUrl}" style="background-color: #ff380b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Email</a>
        </div>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="color: #666; font-size: 14px;">${confirmationUrl}</p>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">This link will expire in 24 hours.</p>
      </div>
    `,
  };

  try {
    if (!ENV.SENDGRID.API_KEY) {
      console.log(`[MOCK EMAIL] To: ${email}, Link: ${confirmationUrl}`);
      return;
    }
    
    await sgMail.send(msg);
    console.log(`Email sent successfully to ${email}`);
  } catch (error) {
    console.error(`Failed to send email to ${email}`, error);
    // Don't throw if SendGrid is just not configured properly locally
    if (error && (error as any).code !== 401) {
      throw error;
    } else {
      console.log(`[MOCK EMAIL FALLBACK - API Key Invalid] To: ${email}, Link: ${confirmationUrl}`);
    }
  }
};
