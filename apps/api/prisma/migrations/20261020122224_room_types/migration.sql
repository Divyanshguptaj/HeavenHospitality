-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ROOM_TYPE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROOM_TYPE_UPDATED';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "roomTypeId" UUID;

-- CreateTable
CREATE TABLE "RoomType" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isAirConditioned" BOOLEAN NOT NULL DEFAULT false,
    "monthlyRentPaise" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomType_propertyId_isActive_idx" ON "RoomType"("propertyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_propertyId_capacity_isAirConditioned_monthlyRentPa_key" ON "RoomType"("propertyId", "capacity", "isAirConditioned", "monthlyRentPaise");

-- CreateIndex
CREATE INDEX "Room_roomTypeId_idx" ON "Room"("roomTypeId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one room type per distinct kind of room already in use, then link the rooms.
INSERT INTO "RoomType" ("id", "propertyId", "capacity", "isAirConditioned", "monthlyRentPaise", "isActive", "updatedAt")
SELECT gen_random_uuid(), "propertyId", "capacity", "isAirConditioned", "monthlyRentPaise", true, CURRENT_TIMESTAMP
FROM "Room"
GROUP BY "propertyId", "capacity", "isAirConditioned", "monthlyRentPaise";

UPDATE "Room" AS r
SET "roomTypeId" = t."id"
FROM "RoomType" AS t
WHERE t."propertyId" = r."propertyId"
  AND t."capacity" = r."capacity"
  AND t."isAirConditioned" = r."isAirConditioned"
  AND t."monthlyRentPaise" = r."monthlyRentPaise";
