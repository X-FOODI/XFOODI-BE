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

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
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
    const scopedEmail = await getTenantScopedEmail(email, req.headers);
    const loginFailKey = `login_fail:${unscopedEmail}`;

    // Check rate limit
    const fails = await redisClient.get(loginFailKey);
    if (fails && parseInt(fails) >= 5) {
      return res.status(429).json({ success: false, message: 'Too many failed login attempts. Please try again later (after 15 minutes).' });
    }

    let user = null;
    
    // 1. First check if there is a global account (Owner/Admin)
    const globalUser = await prisma.user.findFirst({
      where: { email: unscopedEmail },
      include: { roles: { include: { role: true } } }
    });

    if (globalUser) {
      const restaurant = await resolveRestaurantFromHeaders(req.headers);
      const isOwnerOfThisTenant = restaurant && globalUser.roles.some((ur: any) => ur.role.name === 'Owner' && ur.restaurantId === restaurant.id);
      const isSystemAdmin = globalUser.roles.some((ur: any) => ['Admin', 'SuperAdmin', 'System Admin'].includes(ur.role.name));
      
      // Allow if they are Owner of this tenant, System Admin, or if there is no tenant (logged in on main site)
      if (isOwnerOfThisTenant || isSystemAdmin || !restaurant) {
        user = globalUser;
      }
    }

    // 2. If not found or not authorized as global, fallback to tenant-scoped account
    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: scopedEmail },
        include: { roles: { include: { role: true } } }
      });
    }

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email address before logging in.' });
    }

    // Compare provided password with hashed password
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      // Increment fail count
      const currentFails = await redisClient.incr(loginFailKey);
      if (currentFails === 1) {
        await redisClient.expire(loginFailKey, 15 * 60); // 15 minutes TTL
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Reset fail count on success
    await redisClient.del(loginFailKey);

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

    res.json({
      success: true,
      data: {
        id: user.id,
        email: cleanUserEmail(user.email),
        fullName: user.fullName,
        role: req.user.role,
        roles: [req.user.role]
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

    const user = await prisma.user.findFirst({
      where: { email: scopedEmail }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống.' });
    }

    // Generate password reset token
    const token = crypto.randomUUID();
    // Save to Redis with 15 minutes expiration
    await redisClient.setEx(`pwd_reset:${token}`, 900, scopedEmail);

    // Send the email
    await sendResetPasswordEmail(email.toLowerCase(), token);

    res.json({ success: true, message: 'Password reset email sent successfully' });
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

export default router;
