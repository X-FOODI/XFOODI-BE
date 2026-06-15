-- ============================================================
-- Create all Social Community tables
-- ============================================================

-- SocialPosts
CREATE TABLE IF NOT EXISTS "SocialPosts" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "authorId"    TEXT        NOT NULL,
  "content"     TEXT        NOT NULL,
  "visibility"  TEXT        NOT NULL DEFAULT 'public',
  "repostOfId"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialPosts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialPosts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocialPosts_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "SocialPosts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialPosts_authorId_idx"   ON "SocialPosts"("authorId");
CREATE INDEX IF NOT EXISTS "SocialPosts_createdAt_idx"  ON "SocialPosts"("createdAt");
CREATE INDEX IF NOT EXISTS "SocialPosts_visibility_idx" ON "SocialPosts"("visibility");
CREATE INDEX IF NOT EXISTS "SocialPosts_repostOfId_idx" ON "SocialPosts"("repostOfId");

-- SocialImages
CREATE TABLE IF NOT EXISTS "SocialImages" (
  "id"       TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "postId"   TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  CONSTRAINT "SocialImages_pkey"   PRIMARY KEY ("id"),
  CONSTRAINT "SocialImages_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialImages_postId_idx" ON "SocialImages"("postId");

-- SocialComments
CREATE TABLE IF NOT EXISTS "SocialComments" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "postId"    TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "parentId"  TEXT,
  "content"   TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialComments_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "SocialComments_postId_fkey"   FOREIGN KEY ("postId")   REFERENCES "SocialPosts"("id")    ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "SocialComments_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "Users"("id")          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SocialComments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SocialComments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "SocialComments_postId_idx"   ON "SocialComments"("postId");
CREATE INDEX IF NOT EXISTS "SocialComments_userId_idx"   ON "SocialComments"("userId");
CREATE INDEX IF NOT EXISTS "SocialComments_parentId_idx" ON "SocialComments"("parentId");

-- SocialReactions
CREATE TABLE IF NOT EXISTS "SocialReactions" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "postId"    TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "type"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialReactions_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "SocialReactions_postId_userId" UNIQUE ("postId", "userId"),
  CONSTRAINT "SocialReactions_postId_fkey"   FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "SocialReactions_userId_fkey"   FOREIGN KEY ("userId") REFERENCES "Users"("id")       ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialReactions_postId_idx" ON "SocialReactions"("postId");

-- SocialShares
CREATE TABLE IF NOT EXISTS "SocialShares" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "postId"    TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialShares_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "SocialShares_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "SocialShares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id")       ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialShares_postId_idx" ON "SocialShares"("postId");
CREATE INDEX IF NOT EXISTS "SocialShares_userId_idx" ON "SocialShares"("userId");

-- SavedPosts
CREATE TABLE IF NOT EXISTS "SavedPosts" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "postId"    TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SavedPosts_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "SavedPosts_postId_userId"    UNIQUE ("postId", "userId"),
  CONSTRAINT "SavedPosts_postId_fkey"      FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "SavedPosts_userId_fkey"      FOREIGN KEY ("userId") REFERENCES "Users"("id")       ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SavedPosts_userId_idx" ON "SavedPosts"("userId");

-- SocialFollows
CREATE TABLE IF NOT EXISTS "SocialFollows" (
  "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "followerId"  TEXT         NOT NULL,
  "followingId" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialFollows_pkey"                  PRIMARY KEY ("id"),
  CONSTRAINT "SocialFollows_follower_following"    UNIQUE ("followerId", "followingId"),
  CONSTRAINT "SocialFollows_followerId_fkey"       FOREIGN KEY ("followerId")  REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialFollows_followingId_fkey"      FOREIGN KEY ("followingId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialFollows_followerId_idx"  ON "SocialFollows"("followerId");
CREATE INDEX IF NOT EXISTS "SocialFollows_followingId_idx" ON "SocialFollows"("followingId");

-- SocialHashtags
CREATE TABLE IF NOT EXISTS "SocialHashtags" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "tag"       TEXT         NOT NULL,
  "postCount" INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialHashtags_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "SocialHashtags_tag_unique" UNIQUE ("tag")
);
CREATE INDEX IF NOT EXISTS "SocialHashtags_postCount_idx" ON "SocialHashtags"("postCount");

-- SocialPostHashtags
CREATE TABLE IF NOT EXISTS "SocialPostHashtags" (
  "postId"    TEXT         NOT NULL,
  "hashtagId" TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialPostHashtags_pkey"          PRIMARY KEY ("postId", "hashtagId"),
  CONSTRAINT "SocialPostHashtags_postId_fkey"    FOREIGN KEY ("postId")    REFERENCES "SocialPosts"("id")    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialPostHashtags_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "SocialHashtags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialPostHashtags_hashtagId_idx" ON "SocialPostHashtags"("hashtagId");

-- SocialNotifications
CREATE TABLE IF NOT EXISTS "SocialNotifications" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT         NOT NULL,
  "actorId"   TEXT         NOT NULL,
  "type"      TEXT         NOT NULL,
  "postId"    TEXT,
  "commentId" TEXT,
  "message"   VARCHAR(500),
  "read"      BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialNotifications_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "SocialNotifications_userId_fkey" FOREIGN KEY ("userId")  REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialNotifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SocialNotifications_userId_read_createdAt_idx" ON "SocialNotifications"("userId", "read", "createdAt");
CREATE INDEX IF NOT EXISTS "SocialNotifications_actorId_idx" ON "SocialNotifications"("actorId");
