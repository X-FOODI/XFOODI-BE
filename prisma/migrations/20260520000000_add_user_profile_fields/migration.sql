-- Migration: add_user_profile_fields
-- Adds gender, dateOfBirth, and address columns to the Users table.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "gender"      VARCHAR,
  ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "address"     VARCHAR(255);
