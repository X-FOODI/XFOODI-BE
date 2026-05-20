/**
 * TypeScript types for User Profile Management feature.
 * Mirrors the Prisma User model fields relevant to profile operations.
 */

// ─── Request body types ───────────────────────────────────────────────────────

export interface UpdateProfileBody {
  fullName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
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
  provider: string;
  emailVerified: boolean;
  isActive: boolean;
  createdDate: Date;
  modifiedDate: Date | null;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
