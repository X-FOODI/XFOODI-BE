import { Router, type Router as ExpressRouter } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis';
import { API_ROUTES } from '../../constants/routes';
import { sendConfirmationEmail, sendResetPasswordEmail } from '../../lib/email';
import { generateAccessAndRefreshTokens } from '../../services/authToken.service';
import { assignDefaultRole } from '../../services/role.service';
import { verifyTurnstileToken } from '../../utils/turnstile';
import { postGoogleAuth } from '../../controllers/googleAuth.controller';
import totpService from '../../services/totp.service';
import smsService from '../../services/sms.service';

import { ENV } from '../../config/env';

const router: ExpressRouter = Router();
const ACCESS_SECRET = ENV.JWT.ACCESS_SECRET;
const REFRESH_SECRET = ENV.JWT.REFRESH_SECRET;



import { resolveRestaurantFromHeaders } from '../../lib/tenant';

async function getTenantScopedEmail(email: string, headers: any): Promise<string> {
  const restaurant = await resolveRestaurantFromHeaders(headers);
  const normalizedEmail = email.trim().toLowerCase();
  if (restaurant) {
    return `${restaurant.slug}:${normalizedEmail}`;
  }
  return normalizedEmail;
}

function cleanUserEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.includes(':') ? email.substring(email.indexOf(':') + 1) : email;
}

// ── Input Validation Helpers ──
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_MIN_LENGTH = 8;

function validateEmail(email: string): string | null {
  if (!email || !email.trim()) return 'Email is required';
  if (!EMAIL_REGEX.test(email.trim())) return 'Invalid email format';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

// Helper to get roles filtered by active tenant (restaurant) from headers
async function getFilteredRolesForUser(userId: string, headers: any) {
  // Find user roles
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });

  const restaurant = await resolveRestaurantFromHeaders(headers);

  if (!restaurant) {
    // If no tenant context is provided, return all roles (allow login on landing page)
    return {
      roles: userRoles.map((ur: any) => ur.role.name || ''),
      ownerRestaurantId: userRoles.find((ur: any) => ur.role.name === 'Owner')?.restaurantId ?? null,
    };
  }

  // Filter roles: keep global roles AND roles specific to this restaurant
  const filteredRoles = userRoles.filter(
    (ur: any) => !ur.restaurantId || ur.restaurantId === restaurant.id
  );

  return {
    roles: filteredRoles.map((ur: any) => ur.role.name || ''),
    ownerRestaurantId: filteredRoles.find((ur: any) => ur.role.name === 'Owner')?.restaurantId ?? null,
  };
}

// Middleware to protect routes and check blacklist
export const authMiddleware = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, ACCESS_SECRET);

    if (decoded.jti) {
      const isBlacklisted = await redisClient.get(`blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        return res.status(401).json({ success: false, message: 'Token has been revoked. Please log in again.' });
      }
    }

    req.user = decoded;

    // Tenant check: if user token is bound to a specific restaurant, verify it matches the active tenant
    if (decoded.restaurantId) {
      const userRoles = Array.isArray(decoded.roles) ? decoded.roles : decoded.role ? [decoded.role] : [];
      const isSystemAdmin = userRoles.some((r: string) =>
        ['Admin', 'SuperAdmin', 'System Admin'].includes(r)
      );

      if (!isSystemAdmin) {
        const restaurant = await resolveRestaurantFromHeaders(req.headers);
        if (restaurant && restaurant.id !== decoded.restaurantId) {
          return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền truy cập dữ liệu của nhà hàng này.',
          });
        }
      }
    }

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// 1. POST /api/auth/register
router.post(API_ROUTES.AUTH.REGISTER, async (req, res) => {
  try {
    const { email, password, fullName, phoneNumber, turnstileToken } = req.body;

    // Verify Turnstile (bot protection)
    const isHuman = await verifyTurnstileToken(turnstileToken, req.ip || undefined);
    if (!isHuman) {
      return res.status(403).json({ success: false, message: 'Bot verification failed. Please try again.' });
    }

    const emailErr = validateEmail(email);
    if (emailErr) {
      return res.status(400).json({ success: false, message: emailErr });
    }

    const passwordErr = validatePassword(password);
    if (passwordErr) {
      return res.status(400).json({ success: false, message: passwordErr });
    }

    const scopedEmail = await getTenantScopedEmail(email, req.headers);

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: scopedEmail }
    });

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create the user in database
    const newUser = await prisma.user.create({
      data: {
        email: scopedEmail,
        userName: scopedEmail,
        passwordHash,
        fullName,
        phoneNumber,
        emailVerified: false,
        isActive: true
      }
    });

    // Assign default "Customer" role
    await assignDefaultRole(newUser.id);

    // Generate confirmation token and save to Redis
    const token = crypto.randomUUID();
    await redisClient.setEx(`email_confirm:${token}`, 86400, scopedEmail); // 24 hours

    // Send confirmation email
    await sendConfirmationEmail(email.toLowerCase(), token);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to confirm your account.',
      data: {
        id: newUser.id,
        email: cleanUserEmail(newUser.email),
        fullName: newUser.fullName
      }
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during registration' });
  }
});



// 2. POST /api/auth/login
router.post(API_ROUTES.AUTH.LOGIN, async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;

    // Verify Turnstile (bot protection)
    const isHuman = await verifyTurnstileToken(turnstileToken, req.ip || undefined);
    if (!isHuman) {
      return res.status(403).json({ success: false, message: 'Bot verification failed. Please try again.' });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const unscopedEmail = email.trim().toLowerCase();
    const loginFailKey = `login_fail:${unscopedEmail}`;

    // Check rate limit
    const fails = await redisClient.get(loginFailKey);
    if (fails && parseInt(fails) >= 5) {
      return res.status(429).json({ success: false, message: 'Too many failed login attempts. Please try again later (after 15 minutes).' });
    }

    // Find the user by email directly in the active database schema
    const user = await prisma.user.findFirst({
      where: { email: unscopedEmail },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Extract roles
    const userRoles = user.roles.map((ur: any) => ur.role.name || '');
    const isAdminUser = userRoles.some((r: string) => ['Admin', 'SuperAdmin', 'System Admin'].includes(r));

    // Admin Isolation Check
    const tenantDomain = (req.headers['x-tenant-domain'] || req.headers.host || '') as string;
    const isAdminDomain = tenantDomain.startsWith('admin.') || tenantDomain.includes('admin.localhost');

    if (isAdminUser && !isAdminDomain && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: 'Đây là tài khoản quản trị. Vui lòng truy cập trang quản trị để đăng nhập.'
      });
    }

    // Dual-Tier Rate Limiting Check
    if (process.env.NODE_ENV !== 'development') {
      if (isAdminUser) {
        const adminFails = await redisClient.get(`admin_login_fail:${unscopedEmail}`);
        if (adminFails && parseInt(adminFails) >= 3) {
          return res.status(429).json({
            success: false,
            message: 'Tài khoản quản trị đã bị tạm khóa do nhập sai mật khẩu quá 3 lần. Vui lòng thử lại sau 1 giờ.'
          });
        }
      } else {
        const fails = await redisClient.get(`login_fail:${unscopedEmail}`);
        if (fails && parseInt(fails) >= 10) {
          return res.status(429).json({
            success: false,
            message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.'
          });
        }
      }
    }

    if (!user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email address before logging in.' });
    }

    // Compare provided password with hashed password
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      if (process.env.NODE_ENV !== 'development') {
        if (isAdminUser) {
          // Increment admin fail count (1 hour block)
          const currentFails = await redisClient.incr(`admin_login_fail:${unscopedEmail}`);
          if (currentFails === 1) {
            await redisClient.expire(`admin_login_fail:${unscopedEmail}`, 3600); // 1 hour TTL
          }
        } else {
          // Increment standard fail count (15 minutes block)
          const currentFails = await redisClient.incr(`login_fail:${unscopedEmail}`);
          if (currentFails === 1) {
            await redisClient.expire(`login_fail:${unscopedEmail}`, 900); // 15 minutes TTL
          }
        }
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Reset fail count on success
    if (process.env.NODE_ENV !== 'development') {
      if (isAdminUser) {
        await redisClient.del(`admin_login_fail:${unscopedEmail}`);
      } else {
        await redisClient.del(`login_fail:${unscopedEmail}`);
      }
    }

    // ─── Google Authenticator 2FA Challenge ───
    const isDevMode = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === undefined;
    if (isAdminUser && user.twoFactorEnabled && !isDevMode) {
      // Sign short-lived temporary token (5 min) for 2FA validation
      const tempToken = jwt.sign(
        { userId: user.id, purpose: '2fa' },
        ACCESS_SECRET,
        { expiresIn: '5m' }
      );

      console.log(`🔐 [2FA] Admin login requires TOTP verification: ${user.email}`);

      return res.json({
        success: true,
        requires2FA: true,
        message: 'Vui lòng cung cấp mã OTP 2FA từ ứng dụng xác thực.',
        tempToken,
      });
    }

    // Update last login time on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date()
      }
    });

    // Extract roles filtered by current tenant if applicable
    const { roles, ownerRestaurantId } = await getFilteredRolesForUser(user.id, req.headers);

    let restaurantSlug: string | null = null;
    if (ownerRestaurantId) {
      const rest = await prisma.restaurant.findUnique({
        where: { id: ownerRestaurantId },
        select: { slug: true }
      });
      restaurantSlug = rest?.slug ?? null;
    }

    // Generate JWT (includes roles[] and restaurantId)
    const { accessToken, refreshToken } = generateAccessAndRefreshTokens(user, roles, ownerRestaurantId);

    // Lưu Refresh Token trong Redis (TTL: 7 ngày)
    await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: cleanUserEmail(user.email),
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          avatarUrl: user.avatarUrl,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          roles,
          restaurantId: ownerRestaurantId,
          restaurantSlug,
        }
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
});

// 2c. POST /api/auth/unlock - Unlock blocked admin account using Turnstile token
router.post('/unlock', async (req: any, res: any) => {
  try {
    const { email, turnstileToken } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email là bắt buộc.' });
    }

    // Verify Turnstile (bot protection)
    const isHuman = await verifyTurnstileToken(turnstileToken, req.ip || undefined);
    if (!isHuman) {
      return res.status(403).json({ success: false, message: 'Xác thực Bot thất bại. Vui lòng thử lại.' });
    }

    const scopedEmail = await getTenantScopedEmail(email, req.headers);

    // Delete keys in Redis
    const failKey = `admin_login_fail:${scopedEmail}`;
    const normalFailKey = `login_fail:${scopedEmail}`;
    
    await redisClient.del(failKey);
    await redisClient.del(normalFailKey);

    console.log(`🔓 [Unlock] Admin account unlocked via Turnstile: ${scopedEmail}`);

    res.json({
      success: true,
      message: 'Mở khóa tài khoản thành công! Bạn có thể đăng nhập lại.'
    });
  } catch (error) {
    console.error('Unlock account error:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi mở khóa tài khoản.' });
  }
});

// 2b. POST /api/auth/google - Google OAuth sign-in
router.post(API_ROUTES.AUTH.GOOGLE, postGoogleAuth);

// GET /api/auth/google - Info endpoint (for testing)
router.get(API_ROUTES.AUTH.GOOGLE, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Google authentication endpoint',
    method: 'POST',
    body: '{ "googleToken": "<ID_TOKEN_FROM_GOOGLE>" }',
    configured: !!process.env.GOOGLE_CLIENT_ID,
  });
});

// 3. POST /api/auth/refresh-token
router.post(API_ROUTES.AUTH.REFRESH_TOKEN, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    // Verify token
    const decoded: any = jwt.verify(refreshToken, REFRESH_SECRET);
    const userId = decoded.sub;

    // Check if token exists in Redis
    const storedToken = await redisClient.get(`refresh_token:${userId}`);
    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    // Generate new tokens
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const { roles, ownerRestaurantId } = await getFilteredRolesForUser(user.id, req.headers);
    const tokens = generateAccessAndRefreshTokens(user, roles, ownerRestaurantId);

    // Update Redis with new Refresh Token
    await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, tokens.refreshToken);

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });

  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
});

// 4. POST /api/auth/logout
router.post(API_ROUTES.AUTH.LOGOUT, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    // Decode without verifying just to get jti and exp
    const decoded: any = jwt.decode(token);

    if (decoded) {
      if (decoded.jti && decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        const ttl = decoded.exp - now;

        // Thêm accessToken vào blacklist Redis nếu còn hạn
        if (ttl > 0) {
          await redisClient.setEx(`blacklist:${decoded.jti}`, ttl, "1");
        }
      }

      // Xóa refreshToken khỏi Redis
      if (decoded.sub) {
        await redisClient.del(`refresh_token:${decoded.sub}`);
      }
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Endpoint to get current user data
router.get(API_ROUTES.AUTH.ME, authMiddleware, async (req: any, res: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const { roles, ownerRestaurantId } = await getFilteredRolesForUser(user.id, req.headers);
    let restaurantSlug: string | null = null;
    if (ownerRestaurantId) {
      const rest = await prisma.restaurant.findUnique({
        where: { id: ownerRestaurantId },
        select: { slug: true }
      });
      restaurantSlug = rest?.slug ?? null;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: cleanUserEmail(user.email),
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        avatarUrl: user.avatarUrl,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        role: req.user.role,
        roles,
        restaurantId: ownerRestaurantId,
        restaurantSlug
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// Endpoint to resend confirmation email
router.post(API_ROUTES.AUTH.RESEND_CONFIRMATION_EMAIL, async (req: any, res: any) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const scopedEmail = await getTenantScopedEmail(email, req.headers);

    // Rate limit: max 3 resend requests per email per 15 minutes
    const resendRateKey = `resend_confirm_rate:${scopedEmail}`;
    const resendAttempts = await redisClient.get(resendRateKey);
    if (resendAttempts && parseInt(resendAttempts) >= 3) {
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
    }

    const user = await prisma.user.findFirst({
      where: { email: scopedEmail }
    });

    if (!user) {
      // Return success anyway to prevent email enumeration
      return res.json({ success: true, message: 'If your email is registered, a confirmation link has been sent.' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    // Generate new confirmation token
    const token = crypto.randomUUID();
    await redisClient.setEx(`email_confirm:${token}`, 86400, scopedEmail); // 24 hours

    // Send the email via SendGrid
    await sendConfirmationEmail(email.toLowerCase(), token);

    // Increment rate limit counter
    const currentResendAttempts = await redisClient.incr(resendRateKey);
    if (currentResendAttempts === 1) {
      await redisClient.expire(resendRateKey, 15 * 60); // 15 minutes TTL
    }

    res.json({ success: true, message: 'Confirmation email sent successfully' });
  } catch (error) {
    console.error('Resend email error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Endpoint to confirm email
router.get(API_ROUTES.AUTH.CONFIRM_EMAIL, async (req: any, res: any) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    const email = await redisClient.get(`email_confirm:${token}`);
    if (!email) {
      return res.status(400).json({ success: false, message: 'Invalid or expired confirmation link' });
    }

    await prisma.user.updateMany({
      where: { email: email.toLowerCase() },
      data: { emailVerified: true }
    });

    await redisClient.del(`email_confirm:${token}`);

    res.json({ success: true, message: 'Email confirmed successfully. You can now log in.' });
  } catch (error) {
    console.error('Confirm email error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Endpoint to request password reset
router.post(API_ROUTES.AUTH.FORGOT_PASSWORD, async (req: any, res: any) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const scopedEmail = await getTenantScopedEmail(email, req.headers);

    // Rate limit: max 3 password reset requests per email per 15 minutes
    const forgotRateKey = `forgot_pwd_rate:${scopedEmail}`;
    const forgotAttempts = await redisClient.get(forgotRateKey);
    if (forgotAttempts && parseInt(forgotAttempts) >= 3) {
      return res.status(429).json({ success: false, message: 'Too many password reset requests. Please try again later.' });
    }

    const user = await prisma.user.findFirst({
      where: { email: scopedEmail }
    });

    if (!user) {
      // Return success to prevent email enumeration — don't reveal if email exists
      return res.json({ success: true, message: 'If your email is registered, a password reset link has been sent.' });
    }

    // Generate password reset token
    const token = crypto.randomUUID();
    // Save to Redis with 15 minutes expiration
    await redisClient.setEx(`pwd_reset:${token}`, 900, scopedEmail);

    // Send the email
    await sendResetPasswordEmail(email.toLowerCase(), token);

    // Increment rate limit counter
    const currentForgotAttempts = await redisClient.incr(forgotRateKey);
    if (currentForgotAttempts === 1) {
      await redisClient.expire(forgotRateKey, 15 * 60); // 15 minutes TTL
    }

    res.json({ success: true, message: 'If your email is registered, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Endpoint to reset password
router.post(API_ROUTES.AUTH.RESET_PASSWORD, async (req: any, res: any) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token, email, and new password are required' });
    }

    const passwordErr = validatePassword(newPassword);
    if (passwordErr) {
      return res.status(400).json({ success: false, message: passwordErr });
    }

    const redisEmail = await redisClient.get(`pwd_reset:${token}`);
    const scopedEmail = await getTenantScopedEmail(email, req.headers);
    if (!redisEmail || redisEmail !== scopedEmail) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset link' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update user password
    await prisma.user.updateMany({
      where: { email: scopedEmail },
      data: { passwordHash }
    });

    // Delete token from Redis
    await redisClient.del(`pwd_reset:${token}`);

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Setup ──────────────────────────────────────────────────────────────
router.post('/2fa/setup', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Only allow Admin roles to setup 2FA
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : req.user.role ? [req.user.role] : [];
    const isAdmin = userRoles.some((r: string) => ['Admin', 'SuperAdmin', 'System Admin'].includes(r));
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admin accounts can configure 2FA.' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: '2FA is already enabled.' });
    }

    // Generate new secret
    const cleanedEmail = cleanUserEmail(user.email) || 'admin@xfoodi';
    const { secret, uri } = totpService.generateSecret(cleanedEmail);

    // Save secret to database (not yet enabled until verified)
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret }
    });

    // Generate QR code base64 data URL
    const qrCode = await totpService.generateQRCode(uri);

    res.json({
      success: true,
      message: 'TOTP secret generated successfully',
      data: {
        qrCode,
        secret
      }
    });
  } catch (error) {
    console.error('[2FA Setup] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Enable ─────────────────────────────────────────────────────────────
router.post('/2fa/enable', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã xác thực 6 số.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'Vui lòng thực hiện thiết lập 2FA trước.' });
    }

    // Verify TOTP code
    const isValid = totpService.verify(user.twoFactorSecret, code);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Mã xác thực không hợp lệ. Vui lòng thử lại.' });
    }

    // Generate backup codes
    const backupCodes = totpService.generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((c) => totpService.hashBackupCode(c));

    // Enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashedBackupCodes
      }
    });

    res.json({
      success: true,
      message: '2FA has been enabled successfully',
      data: {
        backupCodes // Show once so user can download/save
      }
    });
  } catch (error) {
    console.error('[2FA Enable] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Validate (during Login) ─────────────────────────────────────────────
router.post('/2fa/validate', async (req: any, res: any) => {
  try {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({ success: false, message: 'tempToken and code are required' });
    }

    // Verify tempToken
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, ACCESS_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Temporary token expired or invalid. Please login again.' });
    }

    if (decoded.purpose !== '2fa') {
      return res.status(400).json({ success: false, message: 'Invalid token purpose' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: '2FA is not enabled for this account' });
    }

    // Verify TOTP code or backup code
    let verified = false;
    let backupUsed = false;

    if (code.length === 6) {
      verified = totpService.verify(user.twoFactorSecret, code);
    } else {
      // Check backup code
      const backupIndex = totpService.verifyBackupCode(code, user.twoFactorBackupCodes);
      if (backupIndex !== -1) {
        verified = true;
        backupUsed = true;
        // Remove used backup code
        const updatedBackupCodes = [...user.twoFactorBackupCodes];
        updatedBackupCodes.splice(backupIndex, 1);

        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: updatedBackupCodes }
        });
      }
    }

    if (!verified) {
      return res.status(401).json({ success: false, message: 'Mã xác thực 2FA không hợp lệ.' });
    }

    // Successful TOTP verification -> Complete Login & Issue real JWTs
    const { roles, ownerRestaurantId } = await getFilteredRolesForUser(user.id, req.headers);

    let restaurantSlug: string | null = null;
    if (ownerRestaurantId) {
      const rest = await prisma.restaurant.findUnique({
        where: { id: ownerRestaurantId },
        select: { slug: true }
      });
      restaurantSlug = rest?.slug ?? null;
    }

    const { accessToken, refreshToken } = generateAccessAndRefreshTokens(user, roles, ownerRestaurantId);

    // Save Refresh Token in Redis (TTL: 7 days)
    await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    res.json({
      success: true,
      message: '2FA verified successfully. Login successful.',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: cleanUserEmail(user.email),
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          avatarUrl: user.avatarUrl,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          roles,
          restaurantId: ownerRestaurantId,
          restaurantSlug,
        }
      }
    });
  } catch (error) {
    console.error('[2FA Validate] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Disable ────────────────────────────────────────────────────────────
router.post('/2fa/disable', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã xác thực 2FA hiện tại để tắt.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: '2FA is not enabled.' });
    }

    // Verify code before disabling
    const isValid = totpService.verify(user.twoFactorSecret, code);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mã xác thực không đúng. Không thể tắt 2FA.' });
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: []
      }
    });

    res.json({ success: true, message: '2FA has been disabled successfully' });
  } catch (error) {
    console.error('[2FA Disable] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Status ─────────────────────────────────────────────────────────────
router.get('/2fa/status', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        twoFactorEnabled: user.twoFactorEnabled,
        remainingBackupCodes: user.twoFactorBackupCodes?.length || 0
      }
    });
  } catch (error) {
    console.error('[2FA Status] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Regenerate Backup Codes ─────────────────────────────────────────────
router.post('/2fa/regenerate-backup-codes', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã OTP 2FA hiện tại.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'Tính năng 2FA chưa được kích hoạt cho tài khoản này.' });
    }

    // Verify TOTP code
    const isValid = totpService.verify(user.twoFactorSecret, code);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mã xác thực 2FA không chính xác.' });
    }

    // Generate new backup codes
    const backupCodes = totpService.generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((c) => totpService.hashBackupCode(c));

    // Update backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorBackupCodes: hashedBackupCodes
      }
    });

    res.json({
      success: true,
      message: 'Tạo mới danh sách mã dự phòng thành công.',
      data: {
        backupCodes
      }
    });
  } catch (error) {
    console.error('[2FA Regenerate Backup Codes] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Setup New Device ────────────────────────────────────────────────────
router.post('/2fa/setup-new-device', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã OTP từ thiết bị cũ để xác thực.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'Tính năng 2FA chưa được kích hoạt.' });
    }

    // Verify current device OTP
    const isValid = totpService.verify(user.twoFactorSecret, code);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mã xác thực từ thiết bị hiện tại không chính xác.' });
    }

    // Generate new secret for another device
    const cleanedEmail = cleanUserEmail(user.email) || 'admin@xfoodi';
    const { secret, uri } = totpService.generateSecret(cleanedEmail);

    // Save secret to Redis temporarily for 15 mins (TTL: 900)
    await redisClient.setEx(`temp_2fa_secret:${userId}`, 900, secret);

    // Generate QR code base64 data URL
    const qrCode = await totpService.generateQRCode(uri);

    res.json({
      success: true,
      message: 'Yêu cầu thêm thiết bị mới thành công. Hãy quét mã QR này.',
      data: {
        qrCode,
        secret
      }
    });
  } catch (error) {
    console.error('[2FA Setup New Device] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── 2FA Confirm New Device ──────────────────────────────────────────────────
router.post('/2fa/confirm-new-device', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã xác thực 6 chữ số từ thiết bị mới.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: 'Tính năng 2FA chưa được kích hoạt.' });
    }

    // Fetch the temporary secret from Redis
    const tempSecret = await redisClient.get(`temp_2fa_secret:${userId}`);
    if (!tempSecret) {
      return res.status(400).json({ success: false, message: 'Yêu cầu thêm thiết bị đã hết hạn. Vui lòng xác thực lại từ thiết bị cũ.' });
    }

    // Verify OTP from the new device
    const isValid = totpService.verify(tempSecret, code);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mã xác thực từ thiết bị mới không chính xác. Vui lòng thử lại.' });
    }

    // Persist new secret and regenerate backup codes
    const backupCodes = totpService.generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((c) => totpService.hashBackupCode(c));

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: tempSecret,
        twoFactorBackupCodes: hashedBackupCodes
      }
    });

    // Clean up temporary Redis key
    await redisClient.del(`temp_2fa_secret:${userId}`);

    res.json({
      success: true,
      message: 'Thiết bị 2FA mới đã được đăng ký thành công.',
      data: {
        backupCodes
      }
    });
  } catch (error) {
    console.error('[2FA Confirm New Device] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Phone Number Authentication ─────────────────────────────────────────────

// 1. POST /api/auth/customer/check-phone
// Check if phone number exists in DB
router.post('/customer/check-phone', async (req: any, res: any) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Số điện thoại là bắt buộc.' });
    }

    // Normalize phone number (replace leading '0' with '+84' if applicable)
    let normalizedPhone = phoneNumber.trim();
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '+84' + normalizedPhone.substring(1);
    }

    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone }
    });

    if (user) {
      return res.json({
        success: true,
        exists: true,
        name: user.fullName || cleanUserEmail(user.email) || 'Khách hàng'
      });
    }

    return res.json({
      success: true,
      exists: false
    });
  } catch (error) {
    console.error('Check phone error:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ.' });
  }
});

// 2. POST /api/auth/phone-login/otp
// Generate and send OTP via Twilio SMS
router.post('/phone-login/otp', async (req: any, res: any) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Số điện thoại là bắt buộc.' });
    }

    // Validate phone number format (Vietnamese)
    const VIETNAMESE_PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
    if (!VIETNAMESE_PHONE_REGEX.test(phoneNumber.trim())) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại Việt Nam (ví dụ: 0912345678).' });
    }

    // Normalize phone number to E.164 for Twilio
    let normalizedPhone = phoneNumber.trim();
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '+84' + normalizedPhone.substring(1);
    }

    // Generate secure 6-digit verification code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis (Key phone_otp:{phoneNumber}, TTL 300 seconds = 5 minutes)
    await redisClient.setEx(`phone_otp:${normalizedPhone}`, 300, otp);

    // Send the verification code via SMS
    await smsService.sendVerificationSms(normalizedPhone, otp);

    res.json({
      success: true,
      message: 'Mã xác thực OTP đã được gửi đến số điện thoại của bạn.'
    });
  } catch (error: any) {
    console.error('Send phone OTP error:', error);
    res.status(500).json({ success: false, message: error.message || 'Lỗi gửi tin nhắn xác thực.' });
  }
});

// 3. POST /api/auth/phone-login/verify
// Verify OTP and complete sign-in
router.post('/phone-login/verify', async (req: any, res: any) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, message: 'Số điện thoại và mã OTP là bắt buộc.' });
    }

    // Normalize phone number
    let normalizedPhone = phoneNumber.trim();
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '+84' + normalizedPhone.substring(1);
    }

    // Fetch OTP from Redis
    const cachedOtp = await redisClient.get(`phone_otp:${normalizedPhone}`);
    if (!cachedOtp || cachedOtp !== code.trim()) {
      return res.status(401).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn.' });
    }

    // Delete OTP from Redis on successful verification
    await redisClient.del(`phone_otp:${normalizedPhone}`);

    // Lookup user by phone number
    let user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    // If user does not exist, auto-register them
    if (!user) {
      console.log(`[Phone Auth] Registering new customer for phone: ${normalizedPhone}`);
      
      // We generate a temp unique email for them
      const tempEmail = `phone_${normalizedPhone.replace('+', '')}@xfoodi.local`;

      user = await prisma.user.create({
        data: {
          phoneNumber: normalizedPhone,
          email: tempEmail,
          userName: tempEmail,
          emailVerified: true, // Auto-verified since phone is verified
          provider: 'phone',
          fullName: `User ${normalizedPhone}`,
          isActive: true
        },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      });

      // Assign default Customer role
      await assignDefaultRole(user.id);

      // Re-fetch user to include the newly assigned role
      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      }) as any;
    }

    if (!user) {
      return res.status(500).json({ success: false, message: 'Không thể tạo tài khoản.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa.' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Extract roles filtered by active tenant (restaurant) from headers
    const { roles, ownerRestaurantId } = await getFilteredRolesForUser(user.id, req.headers);

    let restaurantSlug: string | null = null;
    if (ownerRestaurantId) {
      const rest = await prisma.restaurant.findUnique({
        where: { id: ownerRestaurantId },
        select: { slug: true }
      });
      restaurantSlug = rest?.slug ?? null;
    }

    // Generate JWT access and refresh tokens
    const { accessToken, refreshToken } = generateAccessAndRefreshTokens(user, roles, ownerRestaurantId);

    // Save Refresh Token in Redis
    await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    res.json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: cleanUserEmail(user.email),
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          avatarUrl: user.avatarUrl,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          roles,
          restaurantId: ownerRestaurantId,
          restaurantSlug,
        }
      }
    });
  } catch (error) {
    console.error('Verify phone login error:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ trong quá trình xác thực.' });
  }
});

export default router;
