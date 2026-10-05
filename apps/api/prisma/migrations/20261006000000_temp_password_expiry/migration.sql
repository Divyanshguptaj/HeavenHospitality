-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_PASSWORD_RESET';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tempPasswordExpiresAt" TIMESTAMPTZ(3);
