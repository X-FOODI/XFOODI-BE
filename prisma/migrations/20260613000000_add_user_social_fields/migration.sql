-- Add social profile fields to Users table
-- bio and coverImageUrl for social community features

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "bio"           VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
