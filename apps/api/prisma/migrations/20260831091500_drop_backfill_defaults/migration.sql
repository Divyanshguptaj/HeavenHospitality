-- Removes the column defaults that existed only to backfill.
--
-- The previous migration added NOT NULL `createdAt`/`updatedAt` columns to
-- tables that already had rows, which PostgreSQL only permits with a DEFAULT.
-- Once the backfill is done the defaults must go: `updatedAt` is written by
-- Prisma's `@updatedAt` on every write, and a database default would quietly
-- mask a row the application failed to touch.
--
-- `highlights` is the same story — Prisma sends `[]` for an empty scalar list,
-- so the database default is redundant and only makes the schema and the
-- database disagree.

ALTER TABLE "Facility" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "MealTiming" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PropertyPhoto" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PropertyRule" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "WeeklyMenuItem" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Property" ALTER COLUMN "highlights" DROP DEFAULT;
