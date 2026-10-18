-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BALANCE_SETTLED';

-- AlterEnum
ALTER TYPE "InvoiceItemKind" ADD VALUE 'SETTLEMENT';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "lateFeeForgivenPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settledOn" DATE;

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "settledPaise" INTEGER NOT NULL,
    "lateFeeForgivenPaise" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "settledByUserId" UUID,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementSequence" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SettlementSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_number_key" ON "Settlement"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_idempotencyKey_key" ON "Settlement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Settlement_tenancyId_createdAt_idx" ON "Settlement"("tenancyId", "createdAt");

-- CreateIndex
CREATE INDEX "Settlement_propertyId_createdAt_idx" ON "Settlement"("propertyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementSequence_propertyId_fiscalYear_key" ON "SettlementSequence"("propertyId", "fiscalYear");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementSequence" ADD CONSTRAINT "SettlementSequence_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

