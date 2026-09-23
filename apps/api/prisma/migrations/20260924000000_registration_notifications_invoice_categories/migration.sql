-- CreateEnum
CREATE TYPE "RegistrationDocumentType" AS ENUM ('AADHAAR_CARD', 'COLLEGE_ID', 'PASSPORT_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceCategory" AS ENUM ('RENT', 'ELECTRICITY', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "InvoiceItemKind" ADD VALUE 'DEPOSIT';

-- DropIndex
DROP INDEX "Invoice_tenancyId_periodKey_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "category" "InvoiceCategory" NOT NULL DEFAULT 'RENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "collegeOrInstitute" TEXT,
ADD COLUMN     "courseOrSemester" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "documentImageUrl" TEXT,
ADD COLUMN     "documentOtherDescription" TEXT,
ADD COLUMN     "documentType" "RegistrationDocumentType",
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "mutedNotificationKinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "parentMobile" TEXT,
ADD COLUMN     "parentOccupation" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "registrationCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "vehicleNumber" TEXT;

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_channel_key" ON "NotificationDelivery"("dedupeKey", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenancyId_periodKey_category_key" ON "Invoice"("tenancyId", "periodKey", "category");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

