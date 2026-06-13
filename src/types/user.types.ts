/**
 * TypeScript types for User Profile Management feature.
 * Mirrors the Prisma User model fields relevant to profile operations.
 */

// ─── Gender enum ──────────────────────────────────────────────────────────────

export const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDER_VALUES)[number];

// ─── Request body types ───────────────────────────────────────────────────────

export interface UpdateProfileBody {
  fullName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  gender?: Gender;
  dateOfBirth?: string; // ISO 8601 string from client, e.g. "1995-08-20"
  address?: string;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ─── Safe user response (never includes passwordHash) ────────────────────────

export interface UserProfileResponse {
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
  hasPassword: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
