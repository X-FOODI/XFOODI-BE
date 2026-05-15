import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { ENV } from '../config/env';
import { generateAccessAndRefreshTokens } from './authToken.service';

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
  
  if (!clientId) {
    throw new GoogleAuthHttpError(503, 'Google authentication is not configured');
  }

  if (!googleToken || typeof googleToken !== 'string' || !googleToken.trim()) {
    throw new GoogleAuthHttpError(400, 'googleToken is required');
  }

  let payload: TokenPayload | undefined;
  
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: googleToken.trim(),
      audience: clientId,
    });
    payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      throw new GoogleAuthHttpError(401, 'Invalid Google token');
    }
    
    if (payload.email_verified !== true) {
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
    console.error('[GoogleAuth] Token verification failed:', (err as Error).message);
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
  // Step 1: Verify Google token and extract user info
  const { email, name, picture } = await verifyGoogleToken(googleToken);

  // Step 2: Find existing user or create new one
  let user = await prisma.user.findFirst({
    where: { email },
    include: userWithRolesInclude,
  });

  if (!user) {
    // Create new user with random password (Google OAuth users don't use password login)
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
  } else {
    // Update existing user's last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        emailVerified: true,
      },
    });
  }

  // Step 3: Generate JWT tokens
  const roles = user.roles.map((ur) => ur.role?.name || '');
  const { accessToken, refreshToken } = generateAccessAndRefreshTokens(
    { id: user.id, email: user.email, fullName: user.fullName },
    roles
  );

  // Step 4: Store refresh token in Redis (7 days TTL)
  await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      roles,
    },
  };
}
