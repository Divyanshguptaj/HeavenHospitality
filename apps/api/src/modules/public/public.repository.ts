import type { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';

/**
 * Only ACTIVE, publicly-listed properties are visible. Both conditions live in
 * the query itself rather than being filtered afterwards, so an unlisted
 * property cannot leak through a code path that forgets the check.
 */
const PUBLIC_FILTER = {
  isPubliclyListed: true,
  status: 'ACTIVE',
} satisfies Prisma.PropertyWhereInput;

/**
 * Explicit field selection, never `include` on the whole model.
 *
 * A `select` fails closed: a column added later stays private until someone
 * deliberately adds it here. An `include` fails open.
 */
const PUBLIC_SELECT = {
  slug: true,
  name: true,
  tagline: true,
  description: true,
  addressLine: true,
  locality: true,
  city: true,
  state: true,
  pincode: true,
  latitude: true,
  longitude: true,
  contactPhone: true,
  contactEmail: true,
  photos: { select: { url: true, caption: true }, orderBy: { sortOrder: 'asc' } },
  facilities: { select: { label: true, icon: true }, orderBy: { sortOrder: 'asc' } },
  rules: { select: { text: true }, orderBy: { sortOrder: 'asc' } },
  rooms: {
    // A room out of service is not on offer, so its beds must not be counted.
    where: { status: 'ACTIVE' },
    select: {
      roomType: true,
      capacity: true,
      monthlyRentPaise: true,
      isAirConditioned: true,
      description: true,
      facilities: true,
      // Only bed STATUS — never bed ids, labels, room numbers or floors.
      beds: { select: { status: true } },
    },
  },
  mealTimings: { select: { mealType: true, startsAt: true, endsAt: true } },
  menuItems: {
    select: { dayOfWeek: true, mealType: true, items: true },
    orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
  },
  settings: {
    select: {
      paymentDetailsArePublic: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankIfsc: true,
      bankName: true,
      upiId: true,
      upiQrImageUrl: true,
    },
  },
} satisfies Prisma.PropertySelect;

export type PublicPropertyRecord = Prisma.PropertyGetPayload<{ select: typeof PUBLIC_SELECT }>;

export async function findPublicPropertyBySlug(slug: string): Promise<PublicPropertyRecord | null> {
  return prisma.property.findFirst({ where: { slug, ...PUBLIC_FILTER }, select: PUBLIC_SELECT });
}

export async function listPublicProperties(): Promise<PublicPropertyRecord[]> {
  return prisma.property.findMany({
    where: PUBLIC_FILTER,
    select: PUBLIC_SELECT,
    orderBy: { name: 'asc' },
  });
}
