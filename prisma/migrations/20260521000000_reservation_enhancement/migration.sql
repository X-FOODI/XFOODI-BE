-- Migration: reservation_enhancement
-- Adds completedAt, reminderSentAt to Reservations
-- Adds Refunds table and refundId FK to Payments

-- Step 1: Add new columns to Reservations
ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP;
ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP;

-- Step 2: Create Refunds table
CREATE TABLE IF NOT EXISTS "Refunds" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "reservationId" TEXT NOT NULL,
  "amount"        DECIMAL(18,2) NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "metadata"      JSONB,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Refunds_reservationId_fkey"
    FOREIGN KEY ("reservationId")
    REFERENCES "Reservations"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "Refunds_reservationId_idx" ON "Refunds"("reservationId");

-- Step 3: Add refundId FK to Payments (if not already present)
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "refundId" TEXT;
ALTER TABLE "Payments" DROP CONSTRAINT IF EXISTS "Payments_refundId_fkey";
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_refundId_fkey"
  FOREIGN KEY ("refundId")
  REFERENCES "Refunds"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "Payments_refundId_idx" ON "Payments"("refundId");

-- Step 4: Seed CHECKED_IN and COMPLETED StatusValues for RESERVATION type
-- Uses a DO block to be idempotent
DO $$
DECLARE
  v_type_id TEXT;
BEGIN
  -- Get RESERVATION status type
  SELECT id INTO v_type_id FROM "StatusTypes" WHERE code = 'RESERVATION' LIMIT 1;

  IF v_type_id IS NOT NULL THEN
    -- Insert CHECKED_IN if not exists
    INSERT INTO "StatusValues" (id, "statusTypeId", code, name, "colorCode", "isDefault", "displayOrder", "isSystem", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, v_type_id, 'CHECKED_IN', 'Đã check-in', '#6366f1', false, 4, true, NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "StatusValues" WHERE code = 'CHECKED_IN' AND "statusTypeId" = v_type_id
    );

    -- Insert COMPLETED if not exists
    INSERT INTO "StatusValues" (id, "statusTypeId", code, name, "colorCode", "isDefault", "displayOrder", "isSystem", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, v_type_id, 'COMPLETED', 'Hoàn thành', '#3b82f6', false, 5, true, NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "StatusValues" WHERE code = 'COMPLETED' AND "statusTypeId" = v_type_id
    );
  END IF;
END $$;
