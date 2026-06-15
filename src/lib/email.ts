import sgMail from '@sendgrid/mail';
import { ENV } from '../config/env';

// Make sure API key exists before setting it
if (ENV.SENDGRID.API_KEY) {
  sgMail.setApiKey(ENV.SENDGRID.API_KEY);
}

const FROM = {
  email: ENV.SENDGRID.EMAIL_FROM || 'no-reply@xfoodi.com',
  name: ENV.SENDGRID.EMAIL_FROM_NAME || 'XFoodi',
};

async function sendEmail(msg: Parameters<typeof sgMail.send>[0]) {
  const cleanMsg = { ...msg } as any;
  try {
    if (cleanMsg.to) {
      if (typeof cleanMsg.to === 'string') {
        cleanMsg.to = cleanMsg.to.includes(':') ? cleanMsg.to.substring(cleanMsg.to.indexOf(':') + 1) : cleanMsg.to;
      } else if (Array.isArray(cleanMsg.to)) {
        cleanMsg.to = cleanMsg.to.map((item: any) => {
          if (typeof item === 'string') {
            return item.includes(':') ? item.substring(item.indexOf(':') + 1) : item;
          } else if (item && typeof item === 'object' && item.email) {
            return {
              ...item,
              email: item.email.includes(':') ? item.email.substring(item.email.indexOf(':') + 1) : item.email,
            };
          }
          return item;
        });
      } else if (typeof cleanMsg.to === 'object' && cleanMsg.to.email) {
        cleanMsg.to = {
          ...cleanMsg.to,
          email: cleanMsg.to.email.includes(':') ? cleanMsg.to.email.substring(cleanMsg.to.email.indexOf(':') + 1) : cleanMsg.to.email,
        };
      }
    }

    if (!ENV.SENDGRID.API_KEY) {
      console.log(`[MOCK EMAIL]`, JSON.stringify(cleanMsg, null, 2));
      return;
    }
    await sgMail.send(cleanMsg as any);
    console.log(`[Email] Sent to ${cleanMsg.to}`);
  } catch (error: any) {
    console.error(`[Email] Failed`, error?.response?.body || error);
    if (error?.code !== 401) throw error;
    console.log(`[MOCK EMAIL FALLBACK]`, JSON.stringify(cleanMsg, null, 2));
  }
}

export const sendConfirmationEmail = async (email: string, token: string) => {
  const confirmationUrl = `${ENV.FRONTEND_URL}/confirm-email?token=${token}`;
  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: 'Confirm Your XFoodi Account',
    text: `Please confirm your email: ${confirmationUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ff380b;">Welcome to XFoodi!</h2>
        <p>Thank you for registering. Please confirm your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmationUrl}" style="background-color: #ff380b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Email</a>
        </div>
        <p style="color: #666; font-size: 14px;">${confirmationUrl}</p>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">This link will expire in 24 hours.</p>
      </div>
    `,
  });
};

export const sendResetPasswordEmail = async (email: string, token: string) => {
  const resetUrl = `${ENV.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: 'Reset Your XFoodi Password',
    text: `Reset your password: ${resetUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ff380b;">Password Reset</h2>
        <p>You have requested to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #ff380b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">${resetUrl}</p>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">This link will expire in 15 minutes.</p>
      </div>
    `,
  });
};

export const sendApplicationApprovedEmail = async (
  email: string,
  fullName: string,
  restaurantName: string
) => {
  const dashboardUrl = `${ENV.FRONTEND_URL}/restaurant/dashboard`;
  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: 'Đơn đăng ký nhà hàng đã được duyệt - XFoodi',
    text: `Chúc mừng! Đơn đăng ký "${restaurantName}" đã được duyệt. Đăng nhập lại để vào dashboard: ${dashboardUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #22c55e;">Chúc mừng, ${fullName}!</h2>
        <p>Đơn đăng ký mở nhà hàng <strong>"${restaurantName}"</strong> của bạn đã được <strong style="color:#22c55e;">phê duyệt</strong> thành công.</p>
        <p>Bạn đã được cấp quyền <strong>Owner</strong> trên nền tảng XFoodi. Hãy đăng nhập lại để truy cập Dashboard quản lý nhà hàng của bạn.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="background-color: #ff380b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Vào Dashboard Nhà Hàng</a>
        </div>
        <p style="color: #666; font-size: 13px;">Lưu ý: Bạn cần <strong>đăng nhập lại</strong> để nhận quyền Owner mới nhất.</p>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">XFoodi Team · xfoodiprojects@gmail.com</p>
      </div>
    `,
  });
};

export const sendApplicationRejectedEmail = async (
  email: string,
  fullName: string,
  restaurantName: string,
  reason: string
) => {
  const reapplyUrl = `${ENV.FRONTEND_URL}/register-restaurant`;
  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: 'Đơn đăng ký nhà hàng chưa được duyệt - XFoodi',
    text: `Đơn đăng ký "${restaurantName}" chưa được duyệt. Lý do: ${reason}. Nộp lại tại: ${reapplyUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Đơn đăng ký chưa được duyệt</h2>
        <p>Xin chào <strong>${fullName}</strong>,</p>
        <p>Rất tiếc, đơn đăng ký mở nhà hàng <strong>"${restaurantName}"</strong> của bạn <strong style="color:#ef4444;">chưa được phê duyệt</strong>.</p>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #7f1d1d;"><strong>Lý do:</strong> ${reason}</p>
        </div>
        <p>Bạn có thể bổ sung thông tin và nộp lại đơn đăng ký bất cứ lúc nào.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${reapplyUrl}" style="background-color: #ff380b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Nộp Lại Đơn</a>
        </div>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">XFoodi Team · xfoodiprojects@gmail.com</p>
      </div>
    `,
  });
};

export const sendReservationConfirmationEmail = async (
  email: string,
  details: {
    restaurantName: string;
    confirmationCode: string;
    numberOfGuests: number;
    time: string;
    specialRequests?: string;
  }
) => {
  const formattedTime = new Date(details.time).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: `[XFoodi] Xác nhận đặt bàn thành công tại ${details.restaurantName}`,
    text: `Đặt bàn thành công! Mã nhận bàn của bạn là ${details.confirmationCode}. Thời gian: ${formattedTime}, Số khách: ${details.numberOfGuests}.`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color: #ff380b; padding: 24px; text-align: center;">
          <h2 style="color: white; margin: 0; font-size: 24px;">Xác Nhận Đặt Bàn Thành Công</h2>
        </div>
        <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
          <p>Xin chào quý khách,</p>
          <p>Cảm ơn quý khách đã tin tưởng và đặt bàn qua nền tảng <strong>XFoodi</strong>. Dưới đây là thông tin chi tiết về đặt bàn của quý khách:</p>
          
          <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 6px; padding: 18px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
            <p style="margin: 0 0 8px 0;"><strong>Thời gian:</strong> ${formattedTime}</p>
            <p style="margin: 0 0 8px 0;"><strong>Số lượng khách:</strong> ${details.numberOfGuests} người</p>
            ${details.specialRequests ? `<p style="margin: 0 0 8px 0;"><strong>Yêu cầu đặc biệt:</strong> ${details.specialRequests}</p>` : ''}
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #e5e7eb; text-align: center;">
              <span style="font-size: 14px; color: #6b7280; display: block; margin-bottom: 4px;">MÃ NHẬN BÀN CỦA BẠN</span>
              <strong style="font-size: 28px; color: #ff380b; letter-spacing: 2px;">${details.confirmationCode}</strong>
            </div>
          </div>
          
          <p>Quý khách vui lòng xuất trình <strong>Mã nhận bàn</strong> ở trên cho nhân viên khi đến nhà hàng để được tiếp đón chu đáo nhất.</p>
          <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
            Nếu cần hỗ trợ hoặc hủy đặt bàn, quý khách vui lòng liên hệ trực tiếp với nhà hàng.
          </p>
        </div>
      </div>
    `,
  });
};
