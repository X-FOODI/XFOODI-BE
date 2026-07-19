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

/** Strip tenant/staff scope prefix (e.g. "slug:staff:user@mail.com" → "user@mail.com"). */
function cleanEmailAddress(email: string): string {
  return email.includes(':') ? email.substring(email.lastIndexOf(':') + 1) : email;
}

async function sendEmail(msg: Parameters<typeof sgMail.send>[0]) {
  const cleanMsg = { ...msg } as any;
  try {
    if (cleanMsg.to) {
      if (typeof cleanMsg.to === 'string') {
        cleanMsg.to = cleanEmailAddress(cleanMsg.to);
      } else if (Array.isArray(cleanMsg.to)) {
        cleanMsg.to = cleanMsg.to.map((item: any) => {
          if (typeof item === 'string') {
            return cleanEmailAddress(item);
          } else if (item && typeof item === 'object' && item.email) {
            return {
              ...item,
              email: cleanEmailAddress(item.email),
            };
          }
          return item;
        });
      } else if (typeof cleanMsg.to === 'object' && cleanMsg.to.email) {
        cleanMsg.to = {
          ...cleanMsg.to,
          email: cleanEmailAddress(cleanMsg.to.email),
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
    const sendGridErrors = error?.response?.body?.errors;
    console.error(`[Email] Failed`, sendGridErrors || error?.message || error);
    throw error;
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

// ─── Reservation email interfaces & helpers ────────────────────────────────

export interface ReservationEmailDetails {
  restaurantName: string;
  confirmationCode: string;
  numberOfGuests: number;
  time: string; // ISO string
  depositAmount: number;
  tableAssignments?: string[];
  specialRequests?: string;
}

/**
 * Retries an async function up to maxAttempts times with a delay between
 * attempts. Throws the last error if all attempts fail.
 */
export async function sendWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 10_000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Email] Attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (err) {
      lastError = err;
      console.error(`[Email] Attempt ${attempt} failed:`, err);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Wraps sendWithRetry for email sends. Catches the final error after all
 * attempts are exhausted and logs a structured FAILED record, then re-throws.
 */
async function sendEmailWithRetry(
  fn: () => Promise<void>,
  context: { email: string; reservationId?: string },
  maxAttempts: number = 3,
  delayMs: number = 10_000
): Promise<void> {
  try {
    await sendWithRetry(fn, maxAttempts, delayMs);
  } catch (err: any) {
    const failureLog = {
      reservationId: context.reservationId,
      email: context.email,
      reason: err?.message ?? String(err),
      attempts: maxAttempts,
      status: 'FAILED' as const,
    };
    console.error('[Email] Notification FAILED after all attempts:', JSON.stringify(failureLog));
    throw err;
  }
}

// ─── Helper: format time in UTC+7 ─────────────────────────────────────────

function formatVietnamTime(isoTime: string): string {
  return new Date(isoTime).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ─── Helper: format VND ───────────────────────────────────────────────────

function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' ₫';
}

// ─── Reservation pending email ───────────────────────────────────────────

export const sendReservationPendingEmail = async (
  to: string,
  details: Omit<ReservationEmailDetails, 'confirmationCode'>,
  reservationId?: string
): Promise<void> => {
  const formattedTime = formatVietnamTime(details.time);
  const formattedDeposit = formatVND(details.depositAmount);

  await sendEmailWithRetry(() =>
    sendEmail({
      to,
      from: FROM,
      replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
      subject: `[XFoodi] Yêu cầu đặt bàn tại ${details.restaurantName} đang chờ xác nhận`,
      text: `Yêu cầu đặt bàn tại ${details.restaurantName} của bạn đang chờ xác nhận. Thời gian: ${formattedTime}. Số khách: ${details.numberOfGuests}. Tiền cọc: ${formattedDeposit}.`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #f59e0b; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">Yêu Cầu Đặt Bàn Đang Chờ Xác Nhận</h2>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p>Xin chào quý khách,</p>
            <p>Yêu cầu đặt bàn của quý khách tại nhà hàng <strong>${details.restaurantName}</strong> đã được tiếp nhận và <strong>đang chờ chủ nhà hàng xác nhận</strong>. Dưới đây là thông tin chi tiết:</p>

            <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 6px; padding: 18px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian:</strong> ${formattedTime}</p>
              <p style="margin: 0 0 8px 0;"><strong>Số lượng khách:</strong> ${details.numberOfGuests} người</p>
              <p style="margin: 0 0 8px 0;"><strong>Tiền cọc:</strong> ${formattedDeposit}</p>
              ${details.specialRequests
                ? `<p style="margin: 0 0 8px 0;"><strong>Yêu cầu đặc biệt:</strong> ${details.specialRequests}</p>`
                : ''}
            </div>

            <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #78350f;">
              <strong>Lưu ý:</strong> Mã check-in và mã QR nhận bàn sẽ được tự động gửi qua email cho quý khách ngay sau khi chủ nhà hàng phê duyệt yêu cầu đặt bàn này.
            </p>

            <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              XFoodi Team · xfoodiprojects@gmail.com
            </p>
          </div>
        </div>
      `,
    }),
    { email: to, reservationId }
  );
};

// ─── Reservation confirmation email ───────────────────────────────────────

export const sendReservationConfirmationEmail = async (
  to: string,
  details: ReservationEmailDetails,
  reservationId?: string
): Promise<void> => {
  const formattedTime = formatVietnamTime(details.time);
  const formattedDeposit = formatVND(details.depositAmount);

  await sendEmailWithRetry(() =>
    sendEmail({
      to,
      from: FROM,
      replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
      subject: `[XFoodi] Xác nhận đặt bàn tại ${details.restaurantName}`,
      text: `Đặt bàn thành công! Mã nhận bàn: ${details.confirmationCode}. Thời gian: ${formattedTime}. Số khách: ${details.numberOfGuests}. Tiền cọc: ${formattedDeposit}.`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #ff380b; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">Xác Nhận Đặt Bàn Thành Công</h2>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p>Xin chào quý khách,</p>
            <p>Cảm ơn quý khách đã tin tưởng và đặt bàn qua nền tảng <strong>XFoodi</strong>. Dưới đây là thông tin chi tiết về đặt bàn của quý khách:</p>

            <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 6px; padding: 18px; margin: 20px 0;">
              <div style="text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px dashed #e5e7eb;">
                <span style="font-size: 13px; color: #6b7280; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;">Mã nhận bàn của bạn</span>
                <strong style="font-size: 36px; color: #ff380b; letter-spacing: 4px; font-family: monospace;">${details.confirmationCode}</strong>
              </div>
              <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian:</strong> ${formattedTime}</p>
              <p style="margin: 0 0 8px 0;"><strong>Số lượng khách:</strong> ${details.numberOfGuests} người</p>
              <p style="margin: 0 0 8px 0;"><strong>Tiền cọc:</strong> ${formattedDeposit}</p>
              ${details.tableAssignments && details.tableAssignments.length > 0
                ? `<p style="margin: 0 0 8px 0;"><strong>Bàn được xếp:</strong> ${details.tableAssignments.join(', ')}</p>`
                : ''}
              ${details.specialRequests
                ? `<p style="margin: 0 0 8px 0;"><strong>Yêu cầu đặc biệt:</strong> ${details.specialRequests}</p>`
                : ''}
            </div>

            <p>Quý khách vui lòng xuất trình <strong>Mã nhận bàn</strong> ở trên cho nhân viên khi đến nhà hàng.</p>
            <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              Nếu cần hỗ trợ hoặc hủy đặt bàn, quý khách vui lòng liên hệ trực tiếp với nhà hàng.<br/>
              XFoodi Team · xfoodiprojects@gmail.com
            </p>
          </div>
        </div>
      `,
    }),
    { email: to, reservationId }
  );
};

// ─── Reservation cancellation email ──────────────────────────────────────

export const sendReservationCancellationEmail = async (
  to: string,
  details: ReservationEmailDetails & {
    cancelledAt: string;
    refundAmount?: number;
    refundEstimateDays?: number;
    reason?: string;
  },
  reservationId?: string
): Promise<void> => {
  const formattedTime = formatVietnamTime(details.time);
  const formattedCancelledAt = formatVietnamTime(details.cancelledAt);
  const hasRefund = typeof details.refundAmount === 'number' && details.refundAmount > 0;

  await sendEmailWithRetry(() =>
    sendEmail({
      to,
      from: FROM,
      replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
      subject: `[XFoodi] Thông báo hủy đặt bàn tại ${details.restaurantName}`,
      text: `Đặt bàn ${details.confirmationCode} tại ${details.restaurantName} đã được hủy vào ${formattedCancelledAt}.${details.reason ? ` Lý do: ${details.reason}.` : ''}${hasRefund ? ` Hoàn cọc: ${formatVND(details.refundAmount!)} trong ${details.refundEstimateDays ?? 7} ngày làm việc.` : ''}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #ef4444; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">Đặt Bàn Đã Bị Hủy</h2>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p>Xin chào quý khách,</p>
            <p>Đặt bàn của quý khách tại <strong>${details.restaurantName}</strong> đã được hủy. Dưới đây là thông tin chi tiết:</p>

            <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 18px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Mã đặt bàn:</strong> <span style="font-family: monospace; color: #ef4444; font-size: 18px;">${details.confirmationCode}</span></p>
              <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian đặt:</strong> ${formattedTime}</p>
              <p style="margin: 0 0 8px 0;"><strong>Số lượng khách:</strong> ${details.numberOfGuests} người</p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian hủy:</strong> ${formattedCancelledAt}</p>
              ${details.reason ? `<p style="margin: 0; color: #991b1b;"><strong>Lý do hủy:</strong> ${details.reason}</p>` : ''}
            </div>

            ${hasRefund
              ? `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 18px; margin: 20px 0;">
                  <h3 style="margin: 0 0 12px 0; color: #15803d; font-size: 16px;">💰 Thông Tin Hoàn Cọc</h3>
                  <p style="margin: 0 0 8px 0;"><strong>Số tiền hoàn:</strong> <span style="color: #15803d; font-size: 18px; font-weight: bold;">${formatVND(details.refundAmount!)}</span></p>
                  <p style="margin: 0; color: #166534; font-size: 13px;">Tiền hoàn cọc sẽ được chuyển về tài khoản của quý khách trong vòng <strong>${details.refundEstimateDays ?? 7} ngày làm việc</strong>.</p>
                </div>`
              : `<div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 6px; padding: 14px; margin: 20px 0;">
                  <p style="margin: 0; color: #6b7280; font-size: 13px;">Đặt bàn này không có tiền cọc cần hoàn trả.</p>
                </div>`}

            <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              Nếu có thắc mắc, quý khách vui lòng liên hệ với nhà hàng hoặc hỗ trợ XFoodi.<br/>
              XFoodi Team · xfoodiprojects@gmail.com
            </p>
          </div>
        </div>
      `,
    }),
    { email: to, reservationId }
  );
};

// ─── Reservation reminder email ───────────────────────────────────────────

export const sendReservationReminderEmail = async (
  to: string,
  details: ReservationEmailDetails,
  reservationId?: string
): Promise<void> => {
  const formattedTime = formatVietnamTime(details.time);
  const formattedDeposit = formatVND(details.depositAmount);

  await sendEmailWithRetry(() =>
    sendEmail({
      to,
      from: FROM,
      replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
      subject: `[XFoodi] Nhắc nhở: Đặt bàn tại ${details.restaurantName} còn 2 tiếng nữa`,
      text: `Nhắc nhở: Quý khách có đặt bàn tại ${details.restaurantName} lúc ${formattedTime} (còn khoảng 2 tiếng nữa). Mã nhận bàn: ${details.confirmationCode}.`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #f59e0b; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">⏰ Nhắc Nhở Đặt Bàn</h2>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p>Xin chào quý khách,</p>
            <p>Đây là nhắc nhở: quý khách có một buổi đặt bàn tại <strong>${details.restaurantName}</strong> <strong style="color: #d97706;">còn khoảng 2 tiếng nữa</strong>.</p>

            <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 18px; margin: 20px 0;">
              <div style="text-align: center; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px dashed #fcd34d;">
                <span style="font-size: 13px; color: #92400e; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;">Mã nhận bàn</span>
                <strong style="font-size: 32px; color: #b45309; letter-spacing: 4px; font-family: monospace;">${details.confirmationCode}</strong>
              </div>
              <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian:</strong> ${formattedTime}</p>
              <p style="margin: 0 0 8px 0;"><strong>Số lượng khách:</strong> ${details.numberOfGuests} người</p>
              <p style="margin: 0 0 8px 0;"><strong>Tiền cọc:</strong> ${formattedDeposit}</p>
              ${details.tableAssignments && details.tableAssignments.length > 0
                ? `<p style="margin: 0 0 8px 0;"><strong>Bàn:</strong> ${details.tableAssignments.join(', ')}</p>`
                : ''}
              ${details.specialRequests
                ? `<p style="margin: 0;"><strong>Yêu cầu đặc biệt:</strong> ${details.specialRequests}</p>`
                : ''}
            </div>

            <p>Quý khách nhớ mang theo <strong>Mã nhận bàn</strong> để được nhân viên phục vụ nhanh chóng nhé!</p>
            <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              Nếu cần hỗ trợ, vui lòng liên hệ trực tiếp với nhà hàng hoặc XFoodi.<br/>
              XFoodi Team · xfoodiprojects@gmail.com
            </p>
          </div>
        </div>
      `,
    }),
    { email: to, reservationId }
  );
};

// ─── Refund notification email ────────────────────────────────────────────

export const sendRefundNotificationEmail = async (
  to: string,
  details: {
    restaurantName: string;
    confirmationCode: string;
    refundAmount: number;
    estimatedDays: number;
    reason?: string;
  },
  reservationId?: string
): Promise<void> => {
  const formattedRefund = formatVND(details.refundAmount);

  await sendEmailWithRetry(() =>
    sendEmail({
      to,
      from: FROM,
      replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
      subject: `[XFoodi] Thông báo hoàn cọc cho đặt bàn ${details.confirmationCode}`,
      text: `Hoàn cọc ${formattedRefund} cho đặt bàn ${details.confirmationCode} tại ${details.restaurantName} đang được xử lý. Dự kiến ${details.estimatedDays} ngày làm việc.${details.reason ? ` Lý do: ${details.reason}` : ''}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #22c55e; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">💰 Thông Báo Hoàn Cọc</h2>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p>Xin chào quý khách,</p>
            <p>Chúng tôi xin thông báo rằng tiền cọc cho đặt bàn của quý khách đang được xử lý hoàn trả.</p>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 18px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Mã đặt bàn:</strong> <span style="font-family: monospace; font-size: 18px; color: #15803d;">${details.confirmationCode}</span></p>
              <p style="margin: 0 0 8px 0;"><strong>Số tiền hoàn:</strong> <span style="color: #15803d; font-size: 22px; font-weight: bold;">${formattedRefund}</span></p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian dự kiến:</strong> ${details.estimatedDays} ngày làm việc</p>
              ${details.reason
                ? `<p style="margin: 0;"><strong>Lý do:</strong> ${details.reason}</p>`
                : ''}
            </div>

            <p style="background-color: #f9fafb; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #374151;">
              Tiền hoàn cọc sẽ được chuyển về tài khoản thanh toán ban đầu của quý khách trong vòng <strong>${details.estimatedDays} ngày làm việc</strong>. Nếu quá thời hạn vẫn chưa nhận được, vui lòng liên hệ hỗ trợ.
            </p>

            <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              XFoodi Team · xfoodiprojects@gmail.com
            </p>
          </div>
        </div>
      `,
    }),
    { email: to, reservationId }
  );
};
// ─── Reservation rejection email ──────────────────────────────────────────

export const sendReservationRejectedEmail = async (
  to: string,
  details: {
    restaurantName: string;
    confirmationCode: string;
    numberOfGuests: number;
    time: string; // ISO string
    rejectionReason?: string;
  },
  reservationId?: string
): Promise<void> => {
  const formattedTime = formatVietnamTime(details.time);

  await sendEmailWithRetry(() =>
    sendEmail({
      to,
      from: FROM,
      replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
      subject: `[XFoodi] Yêu cầu đặt bàn tại ${details.restaurantName} chưa được chấp nhận`,
      text: `Rất tiếc! Yêu cầu đặt bàn ${details.confirmationCode} tại ${details.restaurantName} (${formattedTime}) đã bị từ chối.${details.rejectionReason ? ` Lý do: ${details.rejectionReason}` : ''}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #ef4444; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">❌ Yêu Cầu Đặt Bàn Chưa Được Chấp Nhận</h2>
          </div>
          <div style="padding: 24px; color: #1f2937; line-height: 1.6;">
            <p>Xin chào quý khách,</p>
            <p>Rất tiếc, yêu cầu đặt bàn của quý khách tại nhà hàng <strong>${details.restaurantName}</strong> đã không được chấp nhận. Dưới đây là thông tin chi tiết:</p>

            <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 18px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Mã yêu cầu:</strong> <span style="font-family: monospace; color: #ef4444; font-size: 16px;">${details.confirmationCode}</span></p>
              <p style="margin: 0 0 8px 0;"><strong>Nhà hàng:</strong> ${details.restaurantName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Thời gian:</strong> ${formattedTime}</p>
              <p style="margin: 0 0 8px 0;"><strong>Số lượng khách:</strong> ${details.numberOfGuests} người</p>
              ${details.rejectionReason
                ? `<div style="margin-top: 12px; padding: 12px 14px; background: #fff1f2; border-left: 4px solid #ef4444; border-radius: 4px;">
                    <p style="margin: 0; color: #991b1b;"><strong>Lý do từ chối:</strong> ${details.rejectionReason}</p>
                  </div>`
                : ''}
            </div>

            <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #78350f;">
              <strong>Gợi ý:</strong> Quý khách có thể thử đặt bàn vào thời điểm khác hoặc liên hệ trực tiếp với nhà hàng để biết thêm thông tin.
            </p>

            <p style="margin-top: 32px; font-size: 13px; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              XFoodi Team · xfoodiprojects@gmail.com
            </p>
          </div>
        </div>
      `,
    }),
    { email: to, reservationId }
  );
};

export const sendAccountDisabledEmail = async (email: string, fullName: string, reason: string, disabledAt: Date) => {
  const formattedDate = disabledAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const supportEmail = ENV.SENDGRID.EMAIL_REPLY_TO || 'xfoodiprojects@gmail.com';

  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: 'Tài khoản XFoodi của bạn đã bị khóa',
    text: [
      `Xin chào ${fullName},`,
      '',
      'Tài khoản XFoodi của bạn đã bị khóa bởi quản trị viên hệ thống.',
      `Lý do: ${reason}`,
      `Thời gian khóa: ${formattedDate}`,
      '',
      'Bạn sẽ không thể đăng nhập cho đến khi tài khoản được mở khóa lại.',
      `Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ: ${supportEmail}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Tài khoản đã bị khóa</h2>
        <p>Xin chào <strong>${fullName}</strong>,</p>
        <p>Tài khoản XFoodi của bạn đã bị <strong style="color:#ef4444;">khóa</strong> bởi quản trị viên hệ thống. Bạn sẽ không thể đăng nhập cho đến khi tài khoản được mở khóa lại.</p>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; color: #7f1d1d; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Lý do khóa tài khoản</p>
          <p style="margin: 0; color: #991b1b; font-size: 15px; line-height: 1.5;">${reason}</p>
        </div>
        <p style="color: #4b5563; font-size: 14px;"><strong>Thời gian khóa:</strong> ${formattedDate}</p>
        <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #78350f;">
          Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ đội ngũ hỗ trợ XFoodi tại <a href="mailto:${supportEmail}" style="color: #ff380b;">${supportEmail}</a>.
        </p>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">XFoodi Team · ${supportEmail}</p>
      </div>
    `,
  });
};

export const sendRestaurantDisabledEmail = async (email: string, restaurantName: string, reason: string, disabledAt: Date) => {
  const formattedDate = disabledAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const supportEmail = ENV.SENDGRID.EMAIL_REPLY_TO || 'xfoodiprojects@gmail.com';

  await sendEmail({
    to: email,
    from: FROM,
    replyTo: ENV.SENDGRID.EMAIL_REPLY_TO,
    subject: `Nhà hàng "${restaurantName}" đã bị khóa trên XFoodi`,
    text: [
      `Nhà hàng "${restaurantName}" của bạn đã bị khóa bởi quản trị viên hệ thống.`,
      `Lý do: ${reason}`,
      `Thời gian khóa: ${formattedDate}`,
      '',
      'Bạn và toàn bộ nhân viên sẽ không thể đăng nhập cho đến khi nhà hàng được mở khóa lại.',
      `Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ: ${supportEmail}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Nhà hàng đã bị khóa</h2>
        <p>Xin chào chủ nhà hàng <strong>${restaurantName}</strong>,</p>
        <p>Nhà hàng của bạn đã bị <strong style="color:#ef4444;">khóa</strong> trên nền tảng XFoodi. Bạn và toàn bộ nhân viên sẽ không thể đăng nhập cho đến khi nhà hàng được mở khóa lại.</p>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; color: #7f1d1d; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Lý do khóa nhà hàng</p>
          <p style="margin: 0; color: #991b1b; font-size: 15px; line-height: 1.5;">${reason}</p>
        </div>
        <p style="color: #4b5563; font-size: 14px;"><strong>Thời gian khóa:</strong> ${formattedDate}</p>
        <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #78350f;">
          Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ đội ngũ hỗ trợ XFoodi tại <a href="mailto:${supportEmail}" style="color: #ff380b;">${supportEmail}</a>.
        </p>
        <p style="margin-top: 40px; font-size: 12px; color: #aaa;">XFoodi Team · ${supportEmail}</p>
      </div>
    `,
  });
};
