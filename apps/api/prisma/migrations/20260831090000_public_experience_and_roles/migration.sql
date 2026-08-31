-- The public / non-resident experience, and the role model that goes with it.
--
-- Written by hand rather than generated. Every rename here (label -> name,
-- text -> title+description, MembershipRole -> UserRole) would be emitted by
-- `prisma migrate dev` as DROP + ADD, which silently discards the property's
-- facilities, house rules and every account's role. These statements move the
-- data instead, so an existing database keeps what it has.
--
-- On a fresh database every backfill is a no-op and only the DDL runs.

-- ---------------------------------------------------------------------------
-- 1. Roles: OWNER/RESIDENT becomes ADMIN/RESIDENT/NON_RESIDENT.
--
-- A new type and a swap, not `ALTER TYPE ... ADD VALUE`. PostgreSQL refuses to
-- USE an enum value added in the same transaction, and this migration must set
-- NON_RESIDENT as a column default immediately -- so adding to the old type
-- would fail at the DEFAULT, halfway through.
-- ---------------------------------------------------------------------------

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RESIDENT', 'NON_RESIDENT');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (CASE "role"::text WHEN 'OWNER' THEN 'ADMIN' ELSE "role"::text END)::"UserRole";

-- Existing accounts keep the role they had. Only accounts created from here on
-- start as NON_RESIDENT, which is what the public signup flow now produces.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'NON_RESIDENT';

ALTER TABLE "PropertyMembership"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (CASE "role"::text WHEN 'OWNER' THEN 'ADMIN' ELSE "role"::text END)::"UserRole";

DROP TYPE "MembershipRole";

-- ---------------------------------------------------------------------------
-- 2. Property: what the public landing screen needs.
--
-- `highlights` defaults to an empty array rather than NULL: "no highlights yet"
-- and "highlights not loaded" must not be the same value to the API.
-- ---------------------------------------------------------------------------

ALTER TABLE "Property" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "Property" ADD COLUMN "heroImageUrl" TEXT;
ALTER TABLE "Property" ADD COLUMN "checkInInfo" TEXT;
ALTER TABLE "Property" ADD COLUMN "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ---------------------------------------------------------------------------
-- 3. Payment visibility: one flag becomes two.
--
-- Both inherit the old value, so nothing that was published becomes hidden and
-- nothing hidden becomes published by running this.
-- ---------------------------------------------------------------------------

ALTER TABLE "PropertySettings"
  ADD COLUMN "showBankDetailsPublicly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PropertySettings"
  ADD COLUMN "showUpiPublicly" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PropertySettings"
SET "showBankDetailsPublicly" = "paymentDetailsArePublic",
    "showUpiPublicly" = "paymentDetailsArePublic";

ALTER TABLE "PropertySettings" DROP COLUMN "paymentDetailsArePublic";

-- ---------------------------------------------------------------------------
-- 4. Gallery: image metadata in PostgreSQL, bytes in object storage.
-- ---------------------------------------------------------------------------

ALTER TABLE "PropertyPhoto" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "PropertyPhoto" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PropertyPhoto" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PropertyPhoto" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX "PropertyPhoto_propertyId_sortOrder_idx";
CREATE INDEX "PropertyPhoto_propertyId_isActive_sortOrder_idx"
  ON "PropertyPhoto"("propertyId", "isActive", "sortOrder");

-- ---------------------------------------------------------------------------
-- 5. Facilities: a name, a description, and a semantic icon key.
--
-- RENAME COLUMN, not DROP + ADD: the seeded facility list is real content the
-- owner would otherwise have to retype.
-- ---------------------------------------------------------------------------

ALTER TABLE "Facility" RENAME COLUMN "label" TO "name";
ALTER TABLE "Facility" RENAME COLUMN "icon" TO "iconKey";
ALTER TABLE "Facility" ADD COLUMN "description" TEXT;
ALTER TABLE "Facility" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Facility" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Facility" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER INDEX "Facility_propertyId_label_key" RENAME TO "Facility_propertyId_name_key";
DROP INDEX "Facility_propertyId_sortOrder_idx";
CREATE INDEX "Facility_propertyId_isActive_sortOrder_idx"
  ON "Facility"("propertyId", "isActive", "sortOrder");

-- ---------------------------------------------------------------------------
-- 6. House rules: one blob of text becomes a title and its detail.
--
-- The existing sentence becomes the description, and the title is taken from
-- its opening clause -- imperfect, but it keeps every rule readable and is a
-- short edit for the owner rather than a re-entry.
-- ---------------------------------------------------------------------------

ALTER TABLE "PropertyRule" ADD COLUMN "title" TEXT;
ALTER TABLE "PropertyRule" ADD COLUMN "description" TEXT;
ALTER TABLE "PropertyRule" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PropertyRule" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PropertyRule" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "PropertyRule"
SET "description" = "text",
    "title" = CASE
      WHEN length("text") <= 48 THEN "text"
      ELSE rtrim(left("text", 45), ' .,;:') || '...'
    END;

ALTER TABLE "PropertyRule" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "PropertyRule" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "PropertyRule" DROP COLUMN "text";

DROP INDEX "PropertyRule_propertyId_sortOrder_idx";
CREATE INDEX "PropertyRule_propertyId_isActive_sortOrder_idx"
  ON "PropertyRule"("propertyId", "isActive", "sortOrder");

-- ---------------------------------------------------------------------------
-- 7. Mess: publishable weekly items, and date-specific overrides.
-- ---------------------------------------------------------------------------

ALTER TABLE "WeeklyMenuItem" ADD COLUMN "description" TEXT;
ALTER TABLE "WeeklyMenuItem" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WeeklyMenuItem" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WeeklyMenuItem" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "MealTiming" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MealTiming" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "MenuOverride" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "items" TEXT[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuOverride_propertyId_date_mealType_key"
  ON "MenuOverride"("propertyId", "date", "mealType");
CREATE INDEX "MenuOverride_propertyId_date_idx" ON "MenuOverride"("propertyId", "date");

ALTER TABLE "MenuOverride"
  ADD CONSTRAINT "MenuOverride_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An override with no dishes is not a menu; it is a row that would render as an
-- empty meal. The API refuses to create one, and so does the database.
ALTER TABLE "MenuOverride"
  ADD CONSTRAINT "menuoverride_has_items" CHECK (cardinality("items") > 0);
