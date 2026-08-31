import type {
  PublicContactView,
  PublicDayMenuView,
  PublicFacilityView,
  PublicGalleryQuery,
  PublicGalleryView,
  PublicHomeView,
  PublicLocationView,
  PublicPropertyView,
  PublicRoomsView,
  PublicRuleView,
  PublicWeekMenuView,
} from '@heaven/contracts';

import { AppError } from '../../errors/AppError.js';
import {
  addDays,
  isDateOnly,
  isoWeekday,
  todayInZone,
  toPrismaDate,
  type DateOnly,
} from '../../lib/dates.js';

import {
  groupRoomsIntoTypes,
  resolveDayMenu,
  toAvailability,
  toMealTimings,
  toPublicContact,
  toPublicFacility,
  toPublicGalleryImage,
  toPublicLocation,
  toPublicProperty,
  toPublicRule,
  type MenuSource,
} from './public.mapper.js';
import {
  countFacilities,
  countGallery,
  findPropertyTimezone,
  findPublicProperty,
  findPublicPropertyId,
  listFacilities,
  listGallery,
  listMealTimings,
  listMenuOverridesForDate,
  listMenuOverridesInRange,
  listPublicRooms,
  listRules,
  listWeeklyMenu,
} from './public.repository.js';

/**
 * The unauthenticated public experience.
 *
 * Nothing in this module reads an actor, and no function here may ever return
 * tenant, staff, payment or occupancy-history data. See docs/0004-authorization.md.
 */

/** How many previews the home screen carries before "see all" takes over. */
const HOME_ROOM_TYPE_PREVIEW = 3;
const HOME_FACILITY_PREVIEW = 6;
const HOME_GALLERY_PREVIEW = 6;

// ---------------------------------------------------------------------------
// Caching
//
// The public response is identical for every viewer and changes only when the
// owner edits something, so a few seconds of staleness costs nothing and blunts
// scraping. Deliberately a plain Map rather than Redis: it holds a handful of
// entries and losing it on restart has no consequence.
//
// The TTL is short on purpose. "Change the menu in the database and see it in
// the app without a rebuild" has to actually feel immediate, and 30 seconds is
// the difference between a feature and a bug report.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Exposed so tests and (later) admin writes can invalidate deterministically. */
export function clearPublicCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Property resolution
// ---------------------------------------------------------------------------

/**
 * A property that is unlisted, inactive or absent is reported as NOT_FOUND.
 *
 * Never FORBIDDEN: a 403 confirms something exists and lets a caller distinguish
 * "withdrawn from public view" from "never existed", which is exactly the
 * distinction an owner withdrawing a listing is trying to erase.
 */
async function requirePropertyId(): Promise<string> {
  const propertyId = await findPublicPropertyId();
  if (propertyId === null) {
    throw new AppError('NOT_FOUND', 'No property is published right now.');
  }
  return propertyId;
}

async function requireProperty() {
  const propertyId = await requirePropertyId();
  const property = await findPublicProperty(propertyId);

  if (property === null) {
    throw new AppError('NOT_FOUND', 'No property is published right now.');
  }

  return { propertyId, property };
}

// ---------------------------------------------------------------------------
// Property, contact, location
// ---------------------------------------------------------------------------

export async function getPublicProperty(): Promise<PublicPropertyView> {
  return cached('property', async () => {
    const { property } = await requireProperty();
    return toPublicProperty(property);
  });
}

export async function getPublicContact(): Promise<PublicContactView> {
  return cached('contact', async () => {
    const { property } = await requireProperty();
    return toPublicContact(property);
  });
}

export async function getPublicLocation(): Promise<PublicLocationView> {
  return cached('location', async () => {
    const { property } = await requireProperty();
    return toPublicLocation(property);
  });
}

// ---------------------------------------------------------------------------
// Rooms and availability
// ---------------------------------------------------------------------------

async function loadRooms(propertyId: string): Promise<PublicRoomsView> {
  const rooms = await listPublicRooms(propertyId);
  const roomTypes = groupRoomsIntoTypes(rooms);
  return { roomTypes, availability: toAvailability(roomTypes) };
}

export async function getPublicRooms(): Promise<PublicRoomsView> {
  return cached('rooms', async () => loadRooms(await requirePropertyId()));
}

export async function getPublicAvailability() {
  return cached('availability', async () => (await loadRooms(await requirePropertyId())).availability);
}

// ---------------------------------------------------------------------------
// Mess
// ---------------------------------------------------------------------------

/**
 * Resolves the date to show a menu for.
 *
 * Defaults to today *in the property's timezone* — the server owns what "today"
 * is, because a device clock is neither trustworthy nor necessarily in the right
 * zone, and a phone an hour ahead must not be shown tomorrow's dinner.
 *
 * An explicit date is accepted but bounded: an unauthenticated caller may look
 * a week either side, which covers "what's on this weekend" and nothing else.
 */
function resolveMenuDate(timezone: string, requested: string | undefined): DateOnly {
  const today = todayInZone(timezone);
  if (requested === undefined) return today;

  if (!isDateOnly(requested)) {
    throw new AppError('VALIDATION_FAILED', 'Date must be in YYYY-MM-DD form.');
  }

  if (requested < addDays(today, -7) || requested > addDays(today, 7)) {
    throw new AppError('VALIDATION_FAILED', 'The published menu covers one week either way.');
  }

  return requested;
}

async function loadMenuSource(
  propertyId: string,
  overrides: MenuSource['overrides'],
): Promise<MenuSource> {
  const [timings, weekly] = await Promise.all([
    listMealTimings(propertyId),
    listWeeklyMenu(propertyId),
  ]);

  return { timings, weekly, overrides };
}

export async function getTodaysMenu(requestedDate?: string): Promise<PublicDayMenuView> {
  const propertyId = await requirePropertyId();
  const timezone = (await findPropertyTimezone(propertyId)) ?? 'Asia/Kolkata';
  const date = resolveMenuDate(timezone, requestedDate);

  return cached(`menu:day:${date}`, async () => {
    const overrides = await listMenuOverridesForDate(propertyId, toPrismaDate(date));
    const source = await loadMenuSource(propertyId, overrides);
    return resolveDayMenu(source, isoWeekday(date), date);
  });
}

/**
 * The whole week, starting from today.
 *
 * Rotated so today leads rather than starting at Monday: someone deciding
 * whether to eat here cares about tonight far more than about last Tuesday.
 * Each day is dated, so a special on Thursday shows up on the right day.
 */
export async function getWeeklyMenu(): Promise<PublicWeekMenuView> {
  const propertyId = await requirePropertyId();
  const timezone = (await findPropertyTimezone(propertyId)) ?? 'Asia/Kolkata';
  const today = todayInZone(timezone);

  return cached(`menu:week:${today}`, async () => {
    const lastDay = addDays(today, 6);
    const overrides = await listMenuOverridesInRange(
      propertyId,
      toPrismaDate(today),
      toPrismaDate(lastDay),
    );

    const [timings, weekly] = await Promise.all([
      listMealTimings(propertyId),
      listWeeklyMenu(propertyId),
    ]);

    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(today, offset);
      const dayOverrides = overrides
        .filter((override) => override.date.toISOString().slice(0, 10) === date)
        .map((override) => ({
          mealType: override.mealType,
          items: override.items,
          description: override.description,
        }));

      return resolveDayMenu({ timings, weekly, overrides: dayOverrides }, isoWeekday(date), date);
    });

    return { todayDayOfWeek: isoWeekday(today), timings: toMealTimings(timings), days };
  });
}

// ---------------------------------------------------------------------------
// Facilities, gallery, rules
// ---------------------------------------------------------------------------

export async function getPublicFacilities(): Promise<PublicFacilityView[]> {
  return cached('facilities', async () => {
    const facilities = await listFacilities(await requirePropertyId());
    return facilities.map(toPublicFacility);
  });
}

/**
 * The gallery, paginated.
 *
 * Paginated even though a property has a few dozen photos: an unauthenticated
 * endpoint that returns "all of them" is one seeded bulk upload away from being
 * a multi-megabyte response on a mobile connection. The page size is bounded by
 * the query schema, not by trust.
 */
export async function getPublicGallery(query: PublicGalleryQuery): Promise<PublicGalleryView> {
  const { page, pageSize } = query;

  return cached(`gallery:${String(page)}:${String(pageSize)}`, async () => {
    const propertyId = await requirePropertyId();

    const [photos, total] = await Promise.all([
      listGallery(propertyId, { skip: (page - 1) * pageSize, take: pageSize }),
      countGallery(propertyId),
    ]);

    return {
      images: photos.map(toPublicGalleryImage),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  });
}

export async function getPublicRules(): Promise<PublicRuleView[]> {
  return cached('rules', async () => {
    const rules = await listRules(await requirePropertyId());
    return rules.map(toPublicRule);
  });
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/**
 * The landing screen, assembled server-side.
 *
 * One request rather than six: this is the screen every first-time visitor
 * loads, often on a phone network, and six round-trips is the difference
 * between a page that appears and a page that assembles itself in front of you.
 * Every section here is a preview — the full lists live behind their own
 * endpoints, so the payload stays small.
 */
export async function getPublicHome(): Promise<PublicHomeView> {
  const propertyId = await requirePropertyId();
  const property = await findPublicProperty(propertyId);

  if (property === null) {
    throw new AppError('NOT_FOUND', 'No property is published right now.');
  }

  const today = todayInZone(property.timezone);

  return cached(`home:${today}`, async () => {
    const [rooms, facilities, facilityCount, gallery, galleryCount, overrides, timings, weekly] =
      await Promise.all([
        loadRooms(propertyId),
        listFacilities(propertyId, HOME_FACILITY_PREVIEW),
        countFacilities(propertyId),
        listGallery(propertyId, { take: HOME_GALLERY_PREVIEW }),
        countGallery(propertyId),
        listMenuOverridesForDate(propertyId, toPrismaDate(today)),
        listMealTimings(propertyId),
        listWeeklyMenu(propertyId),
      ]);

    return {
      property: toPublicProperty(property),
      availability: rooms.availability,
      // The cheapest few, because "from ₹7,000" is the question a landing screen
      // is being asked. groupRoomsIntoTypes already sorts by price.
      roomTypePreview: rooms.roomTypes.slice(0, HOME_ROOM_TYPE_PREVIEW),
      todayMenu: resolveDayMenu({ timings, weekly, overrides }, isoWeekday(today), today),
      facilityPreview: facilities.map(toPublicFacility),
      galleryPreview: gallery.map(toPublicGalleryImage),
      facilityCount,
      galleryCount,
    };
  });
}
