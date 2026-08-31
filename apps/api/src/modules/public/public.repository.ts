import type { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';

/**
 * Data access for the unauthenticated public API.
 *
 * Two disciplines hold throughout this file, and both are structural rather
 * than conventional:
 *
 *   1. **Explicit `select`, never `include`.** A `select` fails closed: a column
 *      added to a model later stays private until someone deliberately lists it
 *      here. An `include` fails open, and the first person to add a private
 *      column to Property would publish it to the internet without noticing.
 *
 *   2. **Filters live in the WHERE clause, not in the mapper.** An inactive
 *      facility or an unpublished photo is never loaded at all, so no code path
 *      downstream can leak it by forgetting a check.
 */

/**
 * Only an ACTIVE, publicly-listed property is visible. Both conditions are part
 * of every lookup — a property the owner has withdrawn from public view must
 * disappear from every endpoint at once, not from the ones that remembered.
 */
const PUBLIC_PROPERTY_FILTER = {
  isPubliclyListed: true,
  status: 'ACTIVE',
} satisfies Prisma.PropertyWhereInput;

/**
 * Resolves *the* property.
 *
 * The MVP is one property, so the public API is singular: no slug in the path,
 * no property picker in the app, no multi-tenant machinery to maintain for a
 * cardinality of one. If a second property is ever listed, the oldest wins and
 * this is the single place that has to change.
 */
export async function findPublicPropertyId(): Promise<string | null> {
  const property = await prisma.property.findFirst({
    where: PUBLIC_PROPERTY_FILTER,
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  return property?.id ?? null;
}

// ---------------------------------------------------------------------------
// Property, contact, location
// ---------------------------------------------------------------------------

const PROPERTY_SELECT = {
  name: true,
  tagline: true,
  description: true,
  heroImageUrl: true,
  highlights: true,
  checkInInfo: true,
  timezone: true,
  addressLine: true,
  locality: true,
  city: true,
  state: true,
  pincode: true,
  latitude: true,
  longitude: true,
  contactPhone: true,
  whatsappPhone: true,
  contactEmail: true,
  settings: {
    select: {
      showBankDetailsPublicly: true,
      showUpiPublicly: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankIfsc: true,
      bankName: true,
      upiId: true,
      upiQrImageUrl: true,
    },
  },
} satisfies Prisma.PropertySelect;

export type PublicPropertyRecord = Prisma.PropertyGetPayload<{ select: typeof PROPERTY_SELECT }>;

export async function findPublicProperty(propertyId: string): Promise<PublicPropertyRecord | null> {
  return prisma.property.findFirst({
    where: { id: propertyId, ...PUBLIC_PROPERTY_FILTER },
    select: PROPERTY_SELECT,
  });
}

/** Just the timezone, for resolving "today" without loading the whole property. */
export async function findPropertyTimezone(propertyId: string): Promise<string | null> {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, ...PUBLIC_PROPERTY_FILTER },
    select: { timezone: true },
  });

  return property?.timezone ?? null;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/**
 * Rooms carry no number, no floor and no bed identity — only the attributes a
 * prospective resident is choosing between, plus bed STATUS so availability can
 * be counted. A bed's status is a number once aggregated; a bed's id is a
 * pointer at a person.
 */
const ROOM_SELECT = {
  roomType: true,
  capacity: true,
  monthlyRentPaise: true,
  isAirConditioned: true,
  description: true,
  facilities: true,
  beds: { select: { status: true } },
} satisfies Prisma.RoomSelect;

export type PublicRoomRecord = Prisma.RoomGetPayload<{ select: typeof ROOM_SELECT }>;

export async function listPublicRooms(propertyId: string): Promise<PublicRoomRecord[]> {
  return prisma.room.findMany({
    // A room out of service is not on offer, so its beds must not be counted.
    where: { propertyId, status: 'ACTIVE' },
    select: ROOM_SELECT,
    orderBy: { monthlyRentPaise: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Mess
// ---------------------------------------------------------------------------

export async function listMealTimings(propertyId: string) {
  return prisma.mealTiming.findMany({
    where: { propertyId },
    select: { mealType: true, startsAt: true, endsAt: true },
  });
}

export async function listWeeklyMenu(propertyId: string) {
  return prisma.weeklyMenuItem.findMany({
    where: { propertyId, isActive: true },
    select: { dayOfWeek: true, mealType: true, items: true, description: true },
    orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
  });
}

/**
 * Overrides for one date. Returned separately from the weekly menu rather than
 * merged in SQL: which one wins is a business rule, and business rules belong
 * somewhere they can be read and tested, not inside a COALESCE.
 */
export async function listMenuOverridesForDate(propertyId: string, date: Date) {
  return prisma.menuOverride.findMany({
    where: { propertyId, date, isActive: true },
    select: { mealType: true, items: true, description: true },
  });
}

/**
 * Overrides across a date range, for the week view. Bounded by the caller to
 * seven days — an unauthenticated endpoint must never accept an open range.
 */
export async function listMenuOverridesInRange(propertyId: string, from: Date, to: Date) {
  return prisma.menuOverride.findMany({
    where: { propertyId, isActive: true, date: { gte: from, lte: to } },
    select: { date: true, mealType: true, items: true, description: true },
    orderBy: { date: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Facilities, gallery, rules
// ---------------------------------------------------------------------------

export async function listFacilities(propertyId: string, limit?: number) {
  return prisma.facility.findMany({
    where: { propertyId, isActive: true },
    select: { name: true, description: true, iconKey: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    ...(limit === undefined ? {} : { take: limit }),
  });
}

export async function countFacilities(propertyId: string): Promise<number> {
  return prisma.facility.count({ where: { propertyId, isActive: true } });
}

export async function listGallery(
  propertyId: string,
  options: { skip?: number; take: number },
): Promise<Array<{ url: string; caption: string | null }>> {
  return prisma.propertyPhoto.findMany({
    where: { propertyId, isActive: true },
    // Never storageKey: the client gets a resolvable address, not the bucket
    // layout. Leaking key structure invites people to guess at neighbours.
    select: { url: true, caption: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    ...(options.skip === undefined ? {} : { skip: options.skip }),
    take: options.take,
  });
}

export async function countGallery(propertyId: string): Promise<number> {
  return prisma.propertyPhoto.count({ where: { propertyId, isActive: true } });
}

export async function listRules(propertyId: string) {
  return prisma.propertyRule.findMany({
    where: { propertyId, isActive: true },
    select: { title: true, description: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });
}
