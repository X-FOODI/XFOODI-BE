/**
 * Manual validators for User Profile Management.
 * No external validation library is used — matches the project's existing pattern.
 */

import { GENDER_VALUES } from '../types/user.types';
import type { UpdateProfileBody, ChangePasswordBody, ValidationResult } from '../types/user.types';

// Vietnamese phone number regex:
// Supports: 03x, 05x, 07x, 08x, 09x — 10 digits total
// Also accepts +84 prefix (e.g. +84912345678)
const VIETNAMESE_PHONE_REGEX = /^(\+84|0)(3[2-9]|5[6-9]|7[0|6-9]|8[0-9]|9[0-9])[0-9]{7}$/;

// Basic URL regex — must start with http:// or https://
const URL_REGEX = /^https?:\/\/.+/;

// Max length for address field (mirrors @db.VarChar(255) in schema)
const ADDRESS_MAX_LENGTH = 255;

/**
 * Validates the request body for PUT /api/users/me
 */
export function validateUpdateProfile(body: UpdateProfileBody): ValidationResult {
  const errors: string[] = [];

  // fullName: optional, min 2 chars
  if (body.fullName !== undefined) {
    if (typeof body.fullName !== 'string' || body.fullName.trim().length < 2) {
      errors.push('fullName must be at least 2 characters');
    }
  }

  // phoneNumber: optional, Vietnamese format
  if (body.phoneNumber !== undefined) {
    if (
      typeof body.phoneNumber !== 'string' ||
      !VIETNAMESE_PHONE_REGEX.test(body.phoneNumber.trim())
    ) {
      errors.push(
        'phoneNumber must be a valid Vietnamese phone number (e.g. 0912345678 or +84912345678)'
      );
    }
  }

  // avatarUrl: optional, valid URL
  if (body.avatarUrl !== undefined) {
    if (typeof body.avatarUrl !== 'string' || !URL_REGEX.test(body.avatarUrl.trim())) {
      errors.push('avatarUrl must be a valid URL starting with http:// or https://');
    }
  }

  // gender: optional, must be one of MALE | FEMALE | OTHER
  if (body.gender !== undefined) {
    if (!GENDER_VALUES.includes(body.gender as any)) {
      errors.push(`gender must be one of: ${GENDER_VALUES.join(', ')}`);
    }
  }

  // dateOfBirth: optional, valid date, cannot be in the future
  if (body.dateOfBirth !== undefined) {
    if (typeof body.dateOfBirth !== 'string') {
      errors.push('dateOfBirth must be a string in ISO 8601 format (e.g. "1995-08-20")');
    } else {
      const parsed = new Date(body.dateOfBirth);
      if (isNaN(parsed.getTime())) {
        errors.push('dateOfBirth is not a valid date');
      } else if (parsed > new Date()) {
        errors.push('dateOfBirth cannot be a future date');
      }
    }
  }

  // address: optional, max 255 chars
  if (body.address !== undefined) {
    if (typeof body.address !== 'string') {
      errors.push('address must be a string');
    } else if (body.address.trim().length > ADDRESS_MAX_LENGTH) {
      errors.push(`address must not exceed ${ADDRESS_MAX_LENGTH} characters`);
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
