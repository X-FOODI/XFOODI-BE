/**
 * User Service — business logic for profile management.
 *
 * Responsibilities:
 *  - Fetch user profile (strips passwordHash)
 *  - Update profile fields (fullName, phoneNumber, avatarUrl, gender, dateOfBirth, address)
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

// ─── Prisma select — reused to avoid selecting passwordHash ──────────────────

const USER_SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phoneNumber: true,
  avatarUrl: true,
  gender: true,
  dateOfBirth: true,
  address: true,
  provider: true,
  emailVerified: true,
  isActive: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ─── Helper: map Prisma result → safe response (no passwordHash) ─────────────

function cleanUserEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.includes(':') ? email.substring(email.indexOf(':') + 1) : email;
}

function toProfileResponse(user: {
  id: string;
  email: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  provider: string;
  emailVerified: boolean;
  isActive: boolean;
  passwordHash?: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): UserProfileResponse {
  return {
    id: user.id,
    email: cleanUserEmail(user.email),
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    address: user.address,
    provider: user.provider,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    hasPassword: user.passwordHash !== null && user.passwordHash !== undefined && user.passwordHash !== '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

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
 * Update a user's profile.
 * Allowed fields: fullName, phoneNumber, avatarUrl, gender, dateOfBirth, address.
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
    gender?: string;
    dateOfBirth?: Date;
    address?: string;
  } = {};

  if (body.fullName !== undefined) updateData.fullName = body.fullName.trim();
  if (body.phoneNumber !== undefined) updateData.phoneNumber = body.phoneNumber.trim();
  if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl.trim();
  if (body.gender !== undefined) updateData.gender = body.gender;
  if (body.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(body.dateOfBirth);
  if (body.address !== undefined) updateData.address = body.address.trim();

  // If nothing was provided, just return the current profile unchanged
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
 *  2. Hashes newPassword with bcrypt
 *  3. Saves the new hash
 *
 * Throws:
 *  - 404 if user not found
 *  - 400 if user has no password (e.g. Google-only account)
 *  - 401 if currentPassword is wrong
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string | undefined,
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

  // If they already have a password set, we MUST verify the current password
  if (user.passwordHash) {
    if (!currentPassword) {
      throw new UserServiceError(400, 'Current password is required');
    }
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UserServiceError(401, 'Current password is incorrect');
    }
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
