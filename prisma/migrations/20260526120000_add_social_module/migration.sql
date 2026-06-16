-- CreateTable
CREATE TABLE "SocialPosts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialImages" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "SocialImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialComments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialComments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialReactions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialReactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialShares" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialShares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPosts" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPosts_authorId_idx" ON "SocialPosts"("authorId");

-- CreateIndex
CREATE INDEX "SocialPosts_createdAt_idx" ON "SocialPosts"("createdAt");

-- CreateIndex
CREATE INDEX "SocialImages_postId_idx" ON "SocialImages"("postId");

-- CreateIndex
CREATE INDEX "SocialComments_postId_idx" ON "SocialComments"("postId");

-- CreateIndex
CREATE INDEX "SocialComments_userId_idx" ON "SocialComments"("userId");

-- CreateIndex
CREATE INDEX "SocialComments_parentId_idx" ON "SocialComments"("parentId");

-- CreateIndex
CREATE INDEX "SocialReactions_postId_idx" ON "SocialReactions"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialReactions_postId_userId_key" ON "SocialReactions"("postId", "userId");

-- CreateIndex
CREATE INDEX "SocialShares_postId_idx" ON "SocialShares"("postId");

-- CreateIndex
CREATE INDEX "SocialShares_userId_idx" ON "SocialShares"("userId");

-- CreateIndex
CREATE INDEX "SavedPosts_userId_idx" ON "SavedPosts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPosts_postId_userId_key" ON "SavedPosts"("postId", "userId");

-- AddForeignKey
ALTER TABLE "SocialPosts" ADD CONSTRAINT "SocialPosts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialImages" ADD CONSTRAINT "SocialImages_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComments" ADD CONSTRAINT "SocialComments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComments" ADD CONSTRAINT "SocialComments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComments" ADD CONSTRAINT "SocialComments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SocialComments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReactions" ADD CONSTRAINT "SocialReactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReactions" ADD CONSTRAINT "SocialReactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialShares" ADD CONSTRAINT "SocialShares_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialShares" ADD CONSTRAINT "SocialShares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPosts" ADD CONSTRAINT "SavedPosts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPosts" ADD CONSTRAINT "SavedPosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
