-- Safe additive fix: columns required by Prisma client after social community schema update
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "bio" VARCHAR(500);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
