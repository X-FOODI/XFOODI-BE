-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLogs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLogs_adminId_idx" ON "AuditLogs"("adminId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLogs_targetId_idx" ON "AuditLogs"("targetId");
