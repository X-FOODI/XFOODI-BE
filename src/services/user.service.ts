/**
 * User Service — business logic for profile management.
 *
 * Responsibilities:
 *  - Fetch user profile (strips passwordHash)
 *  - Update profile fields (fullName, phoneNumber, avatarUrl)
 *  - Change password (verify current → hash new → save)
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import type { UpdateProfileBody, UserProfileResponse } from '../types/user.types';

// ─── Custom error class ───────────────────────────────────────────────────────

export class UserServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'UserServiceError';
    Object.setPrototypeOf(this, UserServiceError.prototype);
  }
}

// ─── Helper: map Prisma user → safe response (no passwordHash) ───────────────

function toProfileResponse(user: {
  id: string;
  email: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  provider: string;
  emailVerified: boolean;
  isActive: boolean;
  createdDate: Date;
  modifiedDate: Date | null;
}): UserProfileResponse {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl,
    provider: user.provider,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    createdDate: user.createdDate,
    modifiedDate: user.modifiedDate,
  };
}

// ─── Prisma select — reused to avoid selecting passwordHash ──────────────────

const USER_SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phoneNumber: true,
  avatarUrl: true,
  provider: true,
  emailVerified: true,
  isActive: true,
  createdDate: true,
  modifiedDate: true,
} as const;

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetch a user's profile by ID.
 * Throws 404 if the user does not exist.
 */
export async function getUserProfile(userId: string): Promise<UserProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SAFE_SELECT,
  });

  if (!user) {
    throw new UserServiceError(404, 'User not found');
  }

  return toProfileResponse(user);
}

/**
 * Update a user's profile (fullName, phoneNumber, avatarUrl).
 * Email is intentionally excluded — it cannot be changed here.
 * Throws 404 if the user does not exist.
 */
export async function updateUserProfile(
  userId: string,
  body: UpdateProfileBody
): Promise<UserProfileResponse> {
  // Confirm user exists before attempting update
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!exists) {
    throw new UserServiceError(404, 'User not found');
  }

  // Build update payload — only include fields that were actually provided
  const updateData: {
    fullName?: string;
    phoneNumber?: string;
    avatarUrl?: string;
  } = {};

  if (body.fullName !== undefined) updateData.fullName = body.fullName.trim();
  if (body.phoneNumber !== undefined) updateData.phoneNumber = body.phoneNumber.trim();
  if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl.trim();

  // If nothing was provided, just return the current profile
  if (Object.keys(updateData).length === 0) {
    return getUserProfile(userId);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: USER_SAFE_SELECT,
  });

  return toProfileResponse(updated);
}

/**
 * Change a user's password.
 *  1. Verifies currentPassword against stored hash
 *  2. Hashes newPassword
 *  3. Saves the new hash
 *
 * Throws:
 *  - 404 if user not found
 *  - 400 if user has no password (e.g. Google-only account)
 *  - 401 if currentPassword is wrong
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // Fetch user including passwordHash for verification
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    throw new UserServiceError(404, 'User not found');
  }

  if (!user.passwordHash) {
    throw new UserServiceError(
      400,
      'This account uses social login and does not have a password. Please use the appropriate sign-in method.'
    );
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new UserServiceError(401, 'Current password is incorrect');
  }

  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);

  // Persist the new hash
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });
}
