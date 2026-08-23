import type { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';
import type { PropertyRecord } from './public.mapper.js';

/**
 * Only ACTIVE, publicly-listed properties are visible. Both conditions are applied
 * in the query itself rather than filtered afterwards, so an unlisted property
 * cannot leak through a code path that forgets the check.
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
  photos: {
    select: { url: true, caption: true },
    orderBy: { sortOrder: 'asc' },
  },
  facilities: {
    select: { label: true, icon: true },
    orderBy: { sortOrder: 'asc' },
  },
  rules: {
    select: { text: true },
    orderBy: { sortOrder: 'asc' },
  },
  roomTypes: {
    select: {
      id: true,
      name: true,
      sharingCapacity: true,
      baseRentPaise: true,
      depositPaise: true,
      description: true,
      amenities: true,
      rooms: {
        // Rooms under maintenance are not offered, so their beds must not be
        // counted as available.
        where: { status: 'ACTIVE' },
        // Only bed *status* is selected — no bed ids, labels, room numbers or
        // floors ever reach the public mapper.
        select: { beds: { select: { status: true } } },
      },
    },
    orderBy: { sortOrder: 'asc' },
  },
  menuItems: {
    select: { dayOfWeek: true, mealType: true, items: true },
    orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
  },
} satisfies Prisma.PropertySelect;

export async function findPublicPropertyBySlug(slug: string): Promise<PropertyRecord | null> {
  return prisma.property.findFirst({
    where: { slug, ...PUBLIC_FILTER },
    select: PUBLIC_SELECT,
  });
}

export async function listPublicProperties(): Promise<PropertyRecord[]> {
  return prisma.property.findMany({
    where: PUBLIC_FILTER,
    select: PUBLIC_SELECT,
    orderBy: { name: 'asc' },
  });
}
