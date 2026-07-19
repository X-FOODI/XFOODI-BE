-- Create VatInvoiceRequest table
CREATE TABLE IF NOT EXISTS "VatInvoiceRequests" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paymentId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "misaRefId" TEXT,
  "misaLookupCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VatInvoiceRequests_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "VatInvoiceRequests_paymentId_idx" ON "VatInvoiceRequests"("paymentId");
CREATE INDEX IF NOT EXISTS "VatInvoiceRequests_restaurantId_idx" ON "VatInvoiceRequests"("restaurantId");
