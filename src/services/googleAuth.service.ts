import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { ENV } from '../config/env';
import { generateAccessAndRefreshTokens } from './authToken.service';
import { assignDefaultRole } from './role.service';
import { resolveRestaurantFromHeaders } from '../lib/tenant';

export class GoogleAuthHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'GoogleAuthHttpError';
    Object.setPrototypeOf(this, GoogleAuthHttpError.prototype);
  }
}

const oauthClient = new OAuth2Client();

const userWithRolesInclude = {
  roles: {
    include: {
      role: true,
    },
  },
} satisfies Prisma.UserInclude;

function logPrismaError(step: string, err: unknown): void {
  if (err instanceof PrismaClientKnownRequestError) {
    console.error(`[GoogleAuth] ❌ Prisma ${step}: code=${err.code}`, err.meta);
    if (err.code === 'P2022') {
      console.error(
        '[GoogleAuth] Hint: column missing — run: npx prisma migrate deploy (with DATABASE_URL and DIRECT_URL set)'
      );
    }
  } else {
    console.error(`[GoogleAuth] ❌ ${step}:`, (err as Error).message);
    console.error('[GoogleAuth] Stack:', (err as Error).stack);
  }
}

export type GoogleSignInResult = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    roles: string[];
    restaurantId?: string | null;
    restaurantSlug?: string | null;
  };
};

export type GoogleTokenPayload = {
  email: string;
  name: string | null;
  picture: string | null;
};

/**
 * Verifies Google ID token and extracts user information
 * @param googleToken - ID token from Google Sign-In
 * @returns Verified user payload { email, name, picture }
 * @throws GoogleAuthHttpError if token is invalid or email not verified
 */
export async function verifyGoogleToken(googleToken: string): Promise<GoogleTokenPayload> {
  const clientId = ENV.GOOGLE.CLIENT_ID;
  
  console.log('[GoogleAuth] verifyGoogleToken called');
  console.log('[GoogleAuth] GOOGLE_CLIENT_ID:', clientId ? `${clientId.substring(0, 30)}...` : 'UNDEFINED');
  console.log('[GoogleAuth] Token length:', googleToken?.length || 0);
  
  if (!clientId) {
    console.error('[GoogleAuth] ❌ GOOGLE_CLIENT_ID not configured');
    throw new GoogleAuthHttpError(503, 'Google authentication is not configured');
  }

  if (!googleToken || typeof googleToken !== 'string' || !googleToken.trim()) {
    console.error('[GoogleAuth] ❌ Invalid googleToken');
    throw new GoogleAuthHttpError(400, 'googleToken is required');
  }

  let payload: TokenPayload | undefined;
  
  try {
    console.log('[GoogleAuth] Calling OAuth2Client.verifyIdToken...');
    // Accept multiple client IDs — FE and BE may use different OAuth clients
    // We verify the token signature is valid (by Google) and extract the payload
    const ticket = await oauthClient.verifyIdToken({
      idToken: googleToken.trim(),
      audience: clientId,
    });
    payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      console.error('[GoogleAuth] ❌ Empty payload or missing email');
      throw new GoogleAuthHttpError(401, 'Invalid Google token');
    }
    
    console.log('[GoogleAuth] ✓ Token verified, email:', payload.email);
    
    if (payload.email_verified !== true) {
      console.error('[GoogleAuth] ❌ Email not verified');
      throw new GoogleAuthHttpError(403, 'Google email is not verified');
    }
    
    return {
      email: payload.email.toLowerCase(),
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  } catch (err) {
    if (err instanceof GoogleAuthHttpError) {
      throw err;
    }
    // Log error but don't expose details to client
    const error = err as Error;
    console.error('[GoogleAuth] ❌ Token verification failed');
    console.error('[GoogleAuth] Error type:', error.constructor.name);
    console.error('[GoogleAuth] Error message:', error.message);
    throw new GoogleAuthHttpError(401, 'Invalid Google token');
  }
}

/**
 * Handles Google OAuth sign-in flow:
 * 1. Verifies Google ID token
 * 2. Finds or creates user in database
 * 3. Generates JWT access and refresh tokens
 * 4. Stores refresh token in Redis
 * 
 * @param googleToken - ID token from Google Sign-In client
 * @returns Authentication tokens and user info
 */
export async function signInWithGoogle(googleToken: string, headers?: any): Promise<GoogleSignInResult> {
  console.log('[GoogleAuth] signInWithGoogle started');
  
  // Step 1: Verify Google token and extract user info
  let rawEmail: string, name: string | null, picture: string | null;
  try {
    const verified = await verifyGoogleToken(googleToken);
    rawEmail = verified.email;
    name = verified.name;
    picture = verified.picture;
    console.log('[GoogleAuth] ✓ Token verified for email:', rawEmail);
  } catch (err) {
    console.error('[GoogleAuth] ❌ Token verification failed in signInWithGoogle');
    throw err;
  }

  // Resolve tenant-specific scoped email
  const restaurant = await resolveRestaurantFromHeaders(headers);
  const email = restaurant ? `${restaurant.slug}:${rawEmail}` : rawEmail;

  // Step 2: Find existing user or create new one
  let user;
  try {
    console.log('[GoogleAuth] Looking up user in DB...');
    user = await prisma.user.findFirst({
      where: { email },
      include: userWithRolesInclude,
    });
    console.log('[GoogleAuth] User lookup result:', user ? 'FOUND' : 'NOT FOUND');
  } catch (dbErr) {
    logPrismaError('findFirst', dbErr);
    throw new GoogleAuthHttpError(500, 'Database error during user lookup');
  }

  if (!user) {
    // Create new user with random password (Google OAuth users don't use password login)
    try {
      console.log('[GoogleAuth] Creating new user...');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(randomBytes(48).toString('hex'), salt);

      user = await prisma.user.create({
        data: {
          email,
          userName: email,
          passwordHash,
          fullName: name,
          avatarUrl: picture,
          emailVerified: true,
          provider: 'google',
          isActive: true,
          lastLoginAt: new Date(),
        },
        include: userWithRolesInclude,
      });
      console.log('[GoogleAuth] ✓ New user created, ID:', user.id);

      // Assign default "Customer" role
      await assignDefaultRole(user.id);
      console.log('[GoogleAuth] ✓ Default role assigned');

      // Reload user with roles to include the newly assigned role
      user = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: userWithRolesInclude,
      });
    } catch (createErr) {
      logPrismaError('create user', createErr);
      throw new GoogleAuthHttpError(500, 'Database error during user creation');
    }
  } else {
    // Update existing user's last login
    try {
      console.log('[GoogleAuth] Updating existing user lastLoginAt...');
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          emailVerified: true,
        },
      });
      console.log('[GoogleAuth] ✓ User updated');
    } catch (updateErr) {
      console.error('[GoogleAuth] ❌ DB update user error:', (updateErr as Error).message);
      // Non-critical error, continue
    }
  }

  // ─── Google Authenticator 2FA Security Block for Google Login ───
  const isDevMode = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === undefined;
  if (user && user.twoFactorEnabled && !isDevMode) {
    const userRoles = user.roles.map((ur: any) => ur.role?.name || '');
    const isAdminUser = userRoles.some((r: string) => ['Admin', 'SuperAdmin', 'System Admin', 'Owner'].includes(r));
    if (isAdminUser) {
      console.warn(`🔐 [GoogleAuth] Google Login blocked for admin with 2FA enabled: ${user.email}`);
      throw new GoogleAuthHttpError(403, 'Tài khoản quản trị của bạn đã được kích hoạt bảo mật 2FA. Vui lòng đăng nhập bằng Email và Mật khẩu để nhập mã xác thực OTP.');
    }
  }

  // Step 3: Generate JWT tokens
  let accessToken: string, refreshToken: string;
  let roles: string[] = [];
  let ownerRestaurantId: string | null = null;
  try {
    console.log('[GoogleAuth] Generating JWT tokens...');
    console.log('[GoogleAuth] JWT_ACCESS_SECRET exists:', !!ENV.JWT.ACCESS_SECRET);
    console.log('[GoogleAuth] JWT_REFRESH_SECRET exists:', !!ENV.JWT.REFRESH_SECRET);
    // Filter roles by resolved restaurant ID
    const currentRestaurantId = restaurant?.id ?? null;

    const filteredRoles = (user.roles ?? []).filter((ur: any) => {
      if (!ur.restaurantId) return true;
      return ur.restaurantId === currentRestaurantId;
    });

    roles = filteredRoles.map((ur: any) => ur.role?.name || '');
    const ownerUserRole = filteredRoles.find((ur: any) => ur.role?.name === 'Owner');
    ownerRestaurantId = ownerUserRole?.restaurantId ?? null;

    const tokens = generateAccessAndRefreshTokens(
      { id: user.id, email: user.email, fullName: user.fullName },
      roles,
      ownerRestaurantId
    );
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    console.log('[GoogleAuth] ✓ JWT tokens generated');
  } catch (jwtErr) {
    console.error('[GoogleAuth] ❌ JWT generation error:', (jwtErr as Error).message);
    throw new GoogleAuthHttpError(500, 'Error generating authentication tokens');
  }

  // Step 4: Store refresh token in Redis (7 days TTL)
  // This is CRITICAL — without this, refresh token rotation won't work
  try {
    console.log('[GoogleAuth] Storing refresh token in Redis...');
    const redisResult = await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);
    console.log('[GoogleAuth] ✓ Refresh token stored, result:', redisResult);
  } catch (redisErr) {
    console.error('[GoogleAuth] ❌ Redis error storing refresh token:', (redisErr as Error).message);
    // Redis failure is critical — the user would be logged in but unable to refresh tokens
    // Throw error so the client can retry rather than get stuck in a broken session
    throw new GoogleAuthHttpError(503, 'Lỗi lưu trữ phiên đăng nhập. Vui lòng thử lại.');
  }

  let restaurantSlug: string | null = null;
  if (ownerRestaurantId) {
    try {
      const rest = await prisma.restaurant.findUnique({
        where: { id: ownerRestaurantId },
        select: { slug: true }
      });
      restaurantSlug = rest?.slug ?? null;
    } catch (dbErr) {
      console.error('[GoogleAuth] Failed to fetch restaurant slug:', dbErr);
    }
  }

  const cleanEmail = (emailStr: string | null) => {
    if (!emailStr) return null;
    return emailStr.includes(':') ? emailStr.substring(emailStr.indexOf(':') + 1) : emailStr;
  };

  console.log('[GoogleAuth] ✓ signInWithGoogle completed successfully');
  
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: cleanEmail(user.email),
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      roles,
      restaurantId: ownerRestaurantId,
      restaurantSlug,
    },
  };
}
