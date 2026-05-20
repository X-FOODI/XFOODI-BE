/**
 * Manual validators for User Profile Management.
 * No external validation library is used — matches the project's existing pattern.
 */

import type { UpdateProfileBody, ChangePasswordBody, ValidationResult } from '../types/user.types';

// Vietnamese phone number regex:
// Supports: 03x, 05x, 07x, 08x, 09x — 10 digits total
// Also accepts +84 prefix (e.g. +84912345678)
const VIETNAMESE_PHONE_REGEX = /^(\+84|0)(3[2-9]|5[6-9]|7[0|6-9]|8[0-9]|9[0-9])[0-9]{7}$/;

// Basic URL regex — must start with http:// or https://
const URL_REGEX = /^https?:\/\/.+/;

/**
 * Validates the request body for PUT /api/users/me
 */
export function validateUpdateProfile(body: UpdateProfileBody): ValidationResult {
  const errors: string[] = [];

  if (body.fullName !== undefined) {
    if (typeof body.fullName !== 'string' || body.fullName.trim().length < 2) {
      errors.push('fullName must be at least 2 characters');
    }
  }

  if (body.phoneNumber !== undefined) {
    if (typeof body.phoneNumber !== 'string' || !VIETNAMESE_PHONE_REGEX.test(body.phoneNumber.trim())) {
      errors.push(
        'phoneNumber must be a valid Vietnamese phone number (e.g. 0912345678 or +84912345678)'
      );
    }
  }

  if (body.avatarUrl !== undefined) {
    if (typeof body.avatarUrl !== 'string' || !URL_REGEX.test(body.avatarUrl.trim())) {
      errors.push('avatarUrl must be a valid URL starting with http:// or https://');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the request body for PUT /api/users/change-password
 */
export function validateChangePassword(body: ChangePasswordBody): ValidationResult {
  const errors: string[] = [];

  if (!body.currentPassword || typeof body.currentPassword !== 'string') {
    errors.push('currentPassword is required');
  }

  if (!body.newPassword || typeof body.newPassword !== 'string') {
    errors.push('newPassword is required');
  } else if (body.newPassword.length < 6) {
    errors.push('newPassword must be at least 6 characters');
  }

  if (!body.confirmPassword || typeof body.confirmPassword !== 'string') {
    errors.push('confirmPassword is required');
  } else if (body.newPassword && body.confirmPassword !== body.newPassword) {
    errors.push('confirmPassword does not match newPassword');
  }

  return { valid: errors.length === 0, errors };
}
