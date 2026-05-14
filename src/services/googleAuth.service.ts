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
    roles: string[];
  };
};

/**
 * Verifies the Google ID token server-side and signs the user in or registers them.
 * Identity (email, name, picture, email_verified) is taken only from the verified token payload.
 */
export async function signInWithGoogle(googleToken: string): Promise<GoogleSignInResult> {
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
    payload = ticket.getPayload() ?? undefined;
    if (!payload) {
      throw new GoogleAuthHttpError(401, 'Invalid Google token');
    }
  } catch (err) {
    if (err instanceof GoogleAuthHttpError) {
      throw err;
    }
    throw new GoogleAuthHttpError(401, 'Invalid Google token');
  }

  if (!payload.email) {
    throw new GoogleAuthHttpError(401, 'Invalid Google token');
  }

  if (payload.email_verified !== true) {
    throw new GoogleAuthHttpError(403, 'Google email is not verified');
  }

  const email = payload.email.toLowerCase();
  const name = payload.name ?? null;
  const picture = payload.picture ?? null;

  let user = await prisma.user.findFirst({
    where: { email },
    include: userWithRolesInclude,
  });

  if (!user) {
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
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        emailVerified: true,
      },
    });
  }

  const roles = user.roles.map((ur) => ur.role?.name || '');
  const { accessToken, refreshToken } = generateAccessAndRefreshTokens(
    { id: user.id, email: user.email, fullName: user.fullName },
    roles
  );

  await redisClient.setEx(`refresh_token:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
    },
  };
}
