import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { ENV } from '../config/env';
import { generateAccessAndRefreshTokens } from './authToken.service';
import { assignDefaultRole } from './role.service';

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
} satisfies PrismaTypes.UserInclude;

function logPrismaError(step: string, err: unknown): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
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
    console.error('[GoogleAuth] Error stack:', error.stack);
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
export async function signInWithGoogle(googleToken: string): Promise<GoogleSignInResult> {
  console.log('[GoogleAuth] signInWithGoogle started');
  
  // Step 1: Verify Google token and extract user info
  let email: string, name: string | null, picture: string | null;
  try {
    const verified = await verifyGoogleToken(googleToken);
    email = verified.email;
    name = verified.name;
    picture = verified.picture;
    console.log('[GoogleAuth] ✓ Token verified for email:', email);
  } catch (err) {
    console.error('[GoogleAuth] ❌ Token verification failed in signInWithGoogle');
    throw err;
  }

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

  // Step 3: Generate JWT tokens
  let accessToken: string, refreshToken: string;
  try {
    console.log('[GoogleAuth] Generating JWT tokens...');
    console.log('[GoogleAuth] JWT_ACCESS_SECRET exists:', !!ENV.JWT.ACCESS_SECRET);
    console.log('[GoogleAuth] JWT_REFRESH_SECRET exists:', !!ENV.JWT.REFRESH_SECRET);
    
    const roles = (user.roles ?? []).map((ur) => ur.role?.name || '');
    const tokens = generateAccessAndRefreshTokens(
      { id: user.id, email: user.email, fullName: user.fullName },
      roles
    );
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    console.log('[GoogleAuth] ✓ JWT tokens generated');
  } catch (jwtErr) {
    console.error('[GoogleAuth] ❌ JWT generation error:', (jwtErr as Error).message);
    throw new GoogleAuthHttpError(500, 'Error generating authentication tokens');
  }

  // Step 4: Store refresh token in Redis (7 days TTL)
  try {
    console.log('[GoogleAuth] Storing refresh token in Redis...');
    await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);
    console.log('[GoogleAuth] ✓ Refresh token stored');
  } catch (redisErr) {
    console.error('[GoogleAuth] ❌ Redis error:', (redisErr as Error).message);
    // Non-critical, continue
  }

  console.log('[GoogleAuth] ✓ signInWithGoogle completed successfully');
  
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      roles: (user.roles ?? []).map((ur) => ur.role?.name || ''),
    },
  };
}
