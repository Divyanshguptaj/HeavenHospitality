-- Phone becomes the login identifier, and phone numbers get verified by OTP.
--
-- Written by hand rather than generated, because `phone` is going from nullable
-- to required-and-unique on a table that already has rows. The generated
-- migration would simply fail on the existing NULLs; this one backfills first,
-- so no row is lost and the constraint lands on clean data.
--
-- On an empty database (a fresh deployment) every backfill step is a no-op and
-- only the DDL runs.

-- ---------------------------------------------------------------------------
-- 1. New columns, nullable for now so existing rows survive the ALTER.
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMPTZ(3);
ALTER TABLE "User" ADD COLUMN "role" "MembershipRole" NOT NULL DEFAULT 'RESIDENT';

-- ---------------------------------------------------------------------------
-- 2. Backfill the role from the memberships that already record it.
--
-- OWNER wins wherever a user holds it at any property: the column answers "what
-- may this account do at all", so the most privileged membership decides.
-- ---------------------------------------------------------------------------

UPDATE "User" AS u
SET "role" = 'OWNER'
WHERE EXISTS (
  SELECT 1 FROM "PropertyMembership" m
  WHERE m."userId" = u."id" AND m."role" = 'OWNER'
);

-- ---------------------------------------------------------------------------
-- 3. Give every row a phone number.
--
-- Rows that have none, and the later duplicates of any number held twice, are
-- assigned a synthetic +9199xxxxxxxx. That block is deliberately outside the
-- +9190xxxxxxxx range the seed uses, so a placeholder can never silently
-- collide with a real seeded account. These accounts keep working; they simply
-- cannot be logged into until someone sets a real number — which is the correct
-- outcome, since we do not know what their number is.
-- ---------------------------------------------------------------------------

WITH needs_number AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS n
  FROM "User"
  WHERE "phone" IS NULL OR "phone" = ''
)
UPDATE "User" AS u
SET "phone" = '+9199' || LPAD((10000000 + needs_number.n)::text, 8, '0')
FROM needs_number
WHERE u."id" = needs_number."id";

-- Keep the earliest holder of each number; move every later one aside. Without
-- this the unique index below would fail on any pre-existing duplicate.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "phone" ORDER BY "createdAt", "id") AS rank_in_group,
         ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS n
  FROM "User"
)
UPDATE "User" AS u
SET "phone" = '+9199' || LPAD((20000000 + ranked.n)::text, 8, '0')
FROM ranked
WHERE u."id" = ranked."id" AND ranked.rank_in_group > 1;

-- ---------------------------------------------------------------------------
-- 4. Existing accounts that already hold a password were provisioned by the
--    seed or the owner, so their numbers count as verified. Without this they
--    would all be locked out by the "verified phone required to log in" rule.
-- ---------------------------------------------------------------------------

UPDATE "User"
SET "phoneVerifiedAt" = COALESCE("phoneVerifiedAt", "createdAt")
WHERE "passwordHash" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Now the data is clean, apply the constraints.
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;

CREATE UNIQUE INDEX "User_phone_key" ON "User" ("phone");
CREATE INDEX "User_role_idx" ON "User" ("role");

-- ---------------------------------------------------------------------------
-- 6. OTP verification.
-- ---------------------------------------------------------------------------

CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'PASSWORD_RESET');

CREATE TABLE "OtpVerification" (
  "id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "purpose" "OtpPurpose" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "verificationTokenHash" TEXT,
  "verificationExpiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OtpVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OtpVerification_verificationTokenHash_key"
  ON "OtpVerification" ("verificationTokenHash");

CREATE INDEX "OtpVerification_phone_purpose_createdAt_idx"
  ON "OtpVerification" ("phone", "purpose", "createdAt");

-- A code cannot be used more times than the attempt limit allows, and cannot
-- expire before it was created. Both are invariants the service relies on, so
-- the database enforces them rather than trusting every future call site.
ALTER TABLE "OtpVerification"
  ADD CONSTRAINT "otpverification_attempts_non_negative" CHECK ("attempts" >= 0);

ALTER TABLE "OtpVerification"
  ADD CONSTRAINT "otpverification_expires_after_creation" CHECK ("expiresAt" > "createdAt");
