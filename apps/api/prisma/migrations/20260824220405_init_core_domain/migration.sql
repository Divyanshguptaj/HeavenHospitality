-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'RESIDENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('RESIDENT_ADDED', 'RESIDENT_MOVED', 'RESIDENT_EXITED', 'BED_ASSIGNED', 'BED_RELEASED', 'PAYMENT_RECORDED', 'PAYMENT_CONFIRMED', 'INVOICE_ISSUED', 'INVOICE_ADJUSTED', 'ELECTRICITY_READING_ADDED', 'ELECTRICITY_READING_CORRECTED', 'COMPLAINT_RAISED', 'COMPLAINT_UPDATED', 'SETTINGS_CHANGED', 'ROOM_CREATED', 'ROOM_UPDATED', 'FLOOR_CREATED', 'ATTENDANCE_OVERRIDDEN');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('ACTIVE', 'NOTICE_PERIOD', 'VACATED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceItemKind" AS ENUM ('RENT', 'ELECTRICITY', 'LATE_FEE', 'OTHER', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('ACTIVE', 'CORRECTED');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'CARPENTER', 'WIFI', 'CLEANING', 'AC', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('BEFORE_DUE', 'ON_DUE', 'AFTER_DUE');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "JobRun" (
    "id" UUID NOT NULL,
    "jobName" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastFailedLoginAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMembership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "deviceLabel" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorRole" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "propertyId" UUID,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "addressLine" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertySettings" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "rentDueDay" INTEGER NOT NULL DEFAULT 5,
    "graceDays" INTEGER NOT NULL DEFAULT 3,
    "lateFeePerDayPaise" INTEGER NOT NULL DEFAULT 10000,
    "lateFeeCapPaise" INTEGER NOT NULL DEFAULT 300000,
    "electricityRatePaisePerUnit" INTEGER NOT NULL DEFAULT 1300,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankName" TEXT,
    "upiId" TEXT,
    "upiQrImageUrl" TEXT,
    "paymentDetailsArePublic" BOOLEAN NOT NULL DEFAULT false,
    "mealCutoffLocalTime" TEXT NOT NULL DEFAULT '21:00',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PropertySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyPhoto" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PropertyPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyRule" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PropertyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "floorId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "monthlyRentPaise" INTEGER NOT NULL,
    "isAirConditioned" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "facilities" TEXT[],
    "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "TenancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "joiningDate" DATE NOT NULL,
    "expectedExitDate" DATE,
    "actualExitDate" DATE,
    "monthlyRentOverridePaise" INTEGER,
    "securityDepositPaise" INTEGER NOT NULL DEFAULT 0,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "startedAt" DATE NOT NULL,
    "endedAt" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "amountPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "lateFeeWaivedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "kind" "InvoiceItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "recordedByUserId" UUID,
    "unallocatedPaise" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "previousReading" INTEGER NOT NULL,
    "currentReading" INTEGER NOT NULL,
    "units" INTEGER NOT NULL,
    "ratePaisePerUnit" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'ACTIVE',
    "correctedByReadingId" UUID,
    "recordedByUserId" UUID,
    "readingDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityShare" (
    "id" UUID NOT NULL,
    "readingId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "sharePaise" INTEGER NOT NULL,
    "occupiedDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectricityShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyMenuItem" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "items" TEXT[],

    CONSTRAINT "WeeklyMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealTiming" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "mealType" "MealType" NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,

    CONSTRAINT "MealTiming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealAbsence" (
    "id" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "overriddenByOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "raisedByUserId" UUID NOT NULL,
    "tenancyId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "imageUrl" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "fromStatus" "ComplaintStatus",
    "toStatus" "ComplaintStatus",
    "note" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "monthlySalaryPaise" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedOn" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAttendance" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitCostPaise" INTEGER,
    "purchasedOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "spentOn" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderEvent" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "invoiceId" UUID,
    "tenancyId" UUID,
    "kind" "ReminderKind" NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_jobName_startedAt_idx" ON "JobRun"("jobName", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_jobName_periodKey_key" ON "JobRun"("jobName", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "PropertyMembership_propertyId_role_idx" ON "PropertyMembership"("propertyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMembership_userId_propertyId_key" ON "PropertyMembership"("userId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_revokedAt_idx" ON "RefreshSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshSession_familyId_idx" ON "RefreshSession"("familyId");

-- CreateIndex
CREATE INDEX "AuditLog_propertyId_createdAt_idx" ON "AuditLog"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_slug_key" ON "Property"("slug");

-- CreateIndex
CREATE INDEX "Property_isPubliclyListed_status_idx" ON "Property"("isPubliclyListed", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PropertySettings_propertyId_key" ON "PropertySettings"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyPhoto_propertyId_sortOrder_idx" ON "PropertyPhoto"("propertyId", "sortOrder");

-- CreateIndex
CREATE INDEX "Facility_propertyId_sortOrder_idx" ON "Facility"("propertyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_propertyId_label_key" ON "Facility"("propertyId", "label");

-- CreateIndex
CREATE INDEX "PropertyRule_propertyId_sortOrder_idx" ON "PropertyRule"("propertyId", "sortOrder");

-- CreateIndex
CREATE INDEX "Floor_propertyId_level_idx" ON "Floor"("propertyId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_propertyId_name_key" ON "Floor"("propertyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_propertyId_level_key" ON "Floor"("propertyId", "level");

-- CreateIndex
CREATE INDEX "Room_propertyId_status_idx" ON "Room"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Room_floorId_idx" ON "Room"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_propertyId_number_key" ON "Room"("propertyId", "number");

-- CreateIndex
CREATE INDEX "Bed_status_idx" ON "Bed"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_roomId_label_key" ON "Bed"("roomId", "label");

-- CreateIndex
CREATE INDEX "Tenancy_propertyId_status_idx" ON "Tenancy"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Tenancy_userId_idx" ON "Tenancy"("userId");

-- CreateIndex
CREATE INDEX "Allocation_bedId_endedAt_idx" ON "Allocation"("bedId", "endedAt");

-- CreateIndex
CREATE INDEX "Allocation_tenancyId_endedAt_idx" ON "Allocation"("tenancyId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_propertyId_status_idx" ON "Invoice"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_propertyId_periodKey_idx" ON "Invoice"("propertyId", "periodKey");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenancyId_periodKey_key" ON "Invoice"("tenancyId", "periodKey");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_propertyId_status_idx" ON "Payment"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Payment_tenancyId_createdAt_idx" ON "Payment"("tenancyId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSequence_propertyId_fiscalYear_key" ON "ReceiptSequence"("propertyId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "MeterReading_propertyId_periodKey_idx" ON "MeterReading"("propertyId", "periodKey");

-- CreateIndex
CREATE INDEX "MeterReading_roomId_periodKey_idx" ON "MeterReading"("roomId", "periodKey");

-- CreateIndex
CREATE INDEX "ElectricityShare_tenancyId_idx" ON "ElectricityShare"("tenancyId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectricityShare_readingId_tenancyId_key" ON "ElectricityShare"("readingId", "tenancyId");

-- CreateIndex
CREATE INDEX "WeeklyMenuItem_propertyId_dayOfWeek_idx" ON "WeeklyMenuItem"("propertyId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyMenuItem_propertyId_dayOfWeek_mealType_key" ON "WeeklyMenuItem"("propertyId", "dayOfWeek", "mealType");

-- CreateIndex
CREATE UNIQUE INDEX "MealTiming_propertyId_mealType_key" ON "MealTiming"("propertyId", "mealType");

-- CreateIndex
CREATE INDEX "MealAbsence_date_mealType_idx" ON "MealAbsence"("date", "mealType");

-- CreateIndex
CREATE UNIQUE INDEX "MealAbsence_tenancyId_date_mealType_key" ON "MealAbsence"("tenancyId", "date", "mealType");

-- CreateIndex
CREATE INDEX "Complaint_propertyId_status_idx" ON "Complaint"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Complaint_raisedByUserId_createdAt_idx" ON "Complaint"("raisedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaintId_createdAt_idx" ON "ComplaintEvent"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "Notice_propertyId_startsOn_idx" ON "Notice"("propertyId", "startsOn");

-- CreateIndex
CREATE INDEX "Staff_propertyId_isActive_idx" ON "Staff"("propertyId", "isActive");

-- CreateIndex
CREATE INDEX "StaffAttendance_date_idx" ON "StaffAttendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId", "date");

-- CreateIndex
CREATE INDEX "InventoryItem_propertyId_category_idx" ON "InventoryItem"("propertyId", "category");

-- CreateIndex
CREATE INDEX "Expense_propertyId_spentOn_idx" ON "Expense"("propertyId", "spentOn");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderEvent_dedupeKey_key" ON "ReminderEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "ReminderEvent_propertyId_status_idx" ON "ReminderEvent"("propertyId", "status");

-- AddForeignKey
ALTER TABLE "PropertyMembership" ADD CONSTRAINT "PropertyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMembership" ADD CONSTRAINT "PropertyMembership_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertySettings" ADD CONSTRAINT "PropertySettings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPhoto" ADD CONSTRAINT "PropertyPhoto_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyRule" ADD CONSTRAINT "PropertyRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptSequence" ADD CONSTRAINT "ReceiptSequence_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityShare" ADD CONSTRAINT "ElectricityShare_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "MeterReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityShare" ADD CONSTRAINT "ElectricityShare_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyMenuItem" ADD CONSTRAINT "WeeklyMenuItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealTiming" ADD CONSTRAINT "MealTiming_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAbsence" ADD CONSTRAINT "MealAbsence_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderEvent" ADD CONSTRAINT "ReminderEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Constraints Prisma cannot express.
--
-- These are load-bearing for correctness, not decoration. Integration tests
-- assert each one still rejects what it was written for, so a future
-- `migrate dev` cannot silently drop them. See docs/0006-idempotency-and-jobs.md.
-- ===========================================================================

-- --- Occupancy ------------------------------------------------------------
-- THE bed-allocation race guard. Two owners assigning the same bed at the same
-- moment both pass any application-level "is it free?" check, because there is
-- always a window between the check and the insert. The database has no such
-- window: the second INSERT fails, and the service turns that into
-- BED_ALREADY_ALLOCATED.
CREATE UNIQUE INDEX "allocation_one_open_per_bed"
  ON "Allocation" ("bedId") WHERE "endedAt" IS NULL;

-- A resident occupies at most one bed at a time. A room move must close the old
-- allocation before opening the new one.
CREATE UNIQUE INDEX "allocation_one_open_per_tenancy"
  ON "Allocation" ("tenancyId") WHERE "endedAt" IS NULL;

ALTER TABLE "Allocation"
  ADD CONSTRAINT "allocation_ends_after_start"
  CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

-- --- Identity -------------------------------------------------------------
ALTER TABLE "User"
  ADD CONSTRAINT "user_has_login_identity"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

ALTER TABLE "User"
  ADD CONSTRAINT "user_failed_attempts_non_negative"
  CHECK ("failedLoginAttempts" >= 0);

ALTER TABLE "RefreshSession"
  ADD CONSTRAINT "refreshsession_expiry_after_creation"
  CHECK ("expiresAt" > "createdAt");

-- --- Rooms and beds -------------------------------------------------------
ALTER TABLE "Room"
  ADD CONSTRAINT "room_capacity_positive" CHECK ("capacity" >= 1);

ALTER TABLE "Room"
  ADD CONSTRAINT "room_rent_non_negative" CHECK ("monthlyRentPaise" >= 0);

ALTER TABLE "Floor"
  ADD CONSTRAINT "floor_level_non_negative" CHECK ("level" >= 0);

-- --- Money ----------------------------------------------------------------
-- Negative money on these rows is always a bug, never a business case:
-- reversals are separate records, and discounts are DISCOUNT invoice items
-- (which may legitimately be negative, so InvoiceItem is excluded).
ALTER TABLE "Invoice"
  ADD CONSTRAINT "invoice_amounts_non_negative"
  CHECK ("totalPaise" >= 0 AND "amountPaidPaise" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_amount_positive" CHECK ("amountPaise" > 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_unallocated_within_amount"
  CHECK ("unallocatedPaise" >= 0 AND "unallocatedPaise" <= "amountPaise");

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "paymentallocation_amount_positive" CHECK ("amountPaise" > 0);

ALTER TABLE "Tenancy"
  ADD CONSTRAINT "tenancy_deposit_non_negative" CHECK ("securityDepositPaise" >= 0);

ALTER TABLE "Tenancy"
  ADD CONSTRAINT "tenancy_rent_override_non_negative"
  CHECK ("monthlyRentOverridePaise" IS NULL OR "monthlyRentOverridePaise" >= 0);

-- --- Settings -------------------------------------------------------------
-- Day 1-28 so the due date exists in every month, February included.
ALTER TABLE "PropertySettings"
  ADD CONSTRAINT "settings_rent_due_day_valid" CHECK ("rentDueDay" BETWEEN 1 AND 28);

ALTER TABLE "PropertySettings"
  ADD CONSTRAINT "settings_financials_non_negative"
  CHECK (
    "graceDays" >= 0
    AND "lateFeePerDayPaise" >= 0
    AND "lateFeeCapPaise" >= 0
    AND "electricityRatePaisePerUnit" >= 0
  );

-- --- Electricity ----------------------------------------------------------
-- A meter does not run backwards. A genuine meter replacement is recorded as a
-- correction, not as a lower reading on the same row.
ALTER TABLE "MeterReading"
  ADD CONSTRAINT "meterreading_not_backwards"
  CHECK ("currentReading" >= "previousReading");

ALTER TABLE "MeterReading"
  ADD CONSTRAINT "meterreading_units_match"
  CHECK ("units" = "currentReading" - "previousReading");

ALTER TABLE "MeterReading"
  ADD CONSTRAINT "meterreading_amounts_non_negative"
  CHECK ("amountPaise" >= 0 AND "ratePaisePerUnit" >= 0);

-- One ACTIVE reading per room per month. Corrections supersede by flipping the
-- old row to CORRECTED, which frees the slot for the replacement.
CREATE UNIQUE INDEX "meterreading_one_active_per_room_period"
  ON "MeterReading" ("roomId", "periodKey") WHERE "status" = 'ACTIVE';

ALTER TABLE "ElectricityShare"
  ADD CONSTRAINT "electricityshare_non_negative"
  CHECK ("sharePaise" >= 0 AND "occupiedDays" >= 0);

-- --- Mess -----------------------------------------------------------------
ALTER TABLE "WeeklyMenuItem"
  ADD CONSTRAINT "weeklymenuitem_day_of_week_valid"
  CHECK ("dayOfWeek" BETWEEN 1 AND 7);

-- --- Invoices -------------------------------------------------------------
ALTER TABLE "Invoice"
  ADD CONSTRAINT "invoice_due_after_issue" CHECK ("dueDate" >= "issueDate");

-- At most ONE late-fee line per invoice. This is what makes the nightly late-fee
-- job idempotent by construction: it upserts this single row rather than
-- appending, so running it twice converges instead of double-charging.
CREATE UNIQUE INDEX "invoiceitem_one_late_fee_per_invoice"
  ON "InvoiceItem" ("invoiceId") WHERE "kind" = 'LATE_FEE';
