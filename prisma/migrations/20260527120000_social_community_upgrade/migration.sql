-- Social community upgrade (additive only)

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "bio" VARCHAR(500);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;

ALTER TABLE "SocialPosts" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "SocialPosts" ADD COLUMN IF NOT EXISTS "repostOfId" TEXT;

CREATE TABLE IF NOT EXISTS "SocialFollows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialFollows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialHashtags" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialHashtags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialPostHashtags" (
    "postId" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPostHashtags_pkey" PRIMARY KEY ("postId","hashtagId")
);

CREATE TABLE IF NOT EXISTS "SocialNotifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "message" VARCHAR(500),
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialNotifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialFollows_followerId_followingId_key" ON "SocialFollows"("followerId", "followingId");
CREATE INDEX IF NOT EXISTS "SocialFollows_followerId_idx" ON "SocialFollows"("followerId");
CREATE INDEX IF NOT EXISTS "SocialFollows_followingId_idx" ON "SocialFollows"("followingId");

CREATE UNIQUE INDEX IF NOT EXISTS "SocialHashtags_tag_key" ON "SocialHashtags"("tag");
CREATE INDEX IF NOT EXISTS "SocialHashtags_postCount_idx" ON "SocialHashtags"("postCount");

CREATE INDEX IF NOT EXISTS "SocialPostHashtags_hashtagId_idx" ON "SocialPostHashtags"("hashtagId");

CREATE INDEX IF NOT EXISTS "SocialNotifications_userId_read_createdAt_idx" ON "SocialNotifications"("userId", "read", "createdAt");
CREATE INDEX IF NOT EXISTS "SocialNotifications_actorId_idx" ON "SocialNotifications"("actorId");

CREATE INDEX IF NOT EXISTS "SocialPosts_visibility_idx" ON "SocialPosts"("visibility");
CREATE INDEX IF NOT EXISTS "SocialPosts_repostOfId_idx" ON "SocialPosts"("repostOfId");

DO $$ BEGIN
  ALTER TABLE "SocialPosts" ADD CONSTRAINT "SocialPosts_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "SocialPosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SocialFollows" ADD CONSTRAINT "SocialFollows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SocialFollows" ADD CONSTRAINT "SocialFollows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SocialPostHashtags" ADD CONSTRAINT "SocialPostHashtags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SocialPostHashtags" ADD CONSTRAINT "SocialPostHashtags_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "SocialHashtags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SocialNotifications" ADD CONSTRAINT "SocialNotifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SocialNotifications" ADD CONSTRAINT "SocialNotifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
