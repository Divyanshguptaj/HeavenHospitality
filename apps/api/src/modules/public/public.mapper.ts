import {
  DAY_NAMES,
  MEAL_TYPES,
  isFacilityIconKey,
  type FacilityIconKey,
  type MealTypeName,
  type PublicAvailabilityView,
  type PublicContactView,
  type PublicDayMenuView,
  type PublicFacilityView,
  type PublicGalleryImageView,
  type PublicLocationView,
  type PublicMealTiming,
  type PublicMealView,
  type PublicPaymentDetails,
  type PublicPropertyView,
  type PublicRoomTypeView,
  type PublicRuleView,
} from '@heaven/contracts';

import type { DateOnly } from '../../lib/dates.js';

import type { PublicPropertyRecord, PublicRoomRecord } from './public.repository.js';

/**
 * Response mapping for the public experience.
 *
 * This module has its OWN mappers and never reuses an owner or resident
 * serializer. Reusing one is how resident PII leaks: a field added for
 * operations would silently widen the public API, and nobody reviewing the
 * operations change would be thinking about the internet.
 *
 * See docs/0004-authorization.md.
 */

// ---------------------------------------------------------------------------
// Property, location, contact
// ---------------------------------------------------------------------------

/**
 * A maps deep link built from what we actually know.
 *
 * Coordinates when the owner recorded them, the written address otherwise — a
 * search URL, so it needs no Maps API key and the device opens it in whatever
 * map application the person already uses. Every component is URL-encoded: an
 * address is owner-entered text, and text that reaches a URL unescaped is how a
 * link becomes something other than a link.
 */
export function buildMapsUrl(
  property: Pick<
    PublicPropertyRecord,
    'name' | 'addressLine' | 'locality' | 'city' | 'state' | 'pincode' | 'latitude' | 'longitude'
  >,
): string {
  if (property.latitude !== null && property.longitude !== null) {
    const query = `${property.latitude.toString()},${property.longitude.toString()}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  const written = [
    property.name,
    property.addressLine,
    property.locality,
    property.city,
    property.state,
    property.pincode,
  ]
    .filter((part) => part !== '')
    .join(', ');

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(written)}`;
}

export function toPublicLocation(property: PublicPropertyRecord): PublicLocationView {
  return {
    address: {
      line: property.addressLine,
      locality: property.locality,
      city: property.city,
      state: property.state,
      pincode: property.pincode,
    },
    coordinates:
      property.latitude === null || property.longitude === null
        ? null
        : {
            latitude: Number(property.latitude.toString()),
            longitude: Number(property.longitude.toString()),
          },
    mapsUrl: buildMapsUrl(property),
  };
}

/**
 * Bank and UPI details, filtered by the owner's two visibility switches.
 *
 * An unpublished half is `null` — omitted from the payload entirely rather than
 * sent with the fields blanked. "Hidden in the UI but present in the response"
 * is not hidden at all; it is one devtools panel away from being public.
 */
function toPublicPaymentDetails(
  settings: PublicPropertyRecord['settings'],
): PublicPaymentDetails | null {
  if (settings === null) return null;

  const bank = settings.showBankDetailsPublicly
    ? {
        accountName: settings.bankAccountName,
        accountNumber: settings.bankAccountNumber,
        ifsc: settings.bankIfsc,
        bankName: settings.bankName,
      }
    : null;

  const upi = settings.showUpiPublicly
    ? { upiId: settings.upiId, qrImageUrl: settings.upiQrImageUrl }
    : null;

  // Nothing published at all reads as "no payment details", not as an object
  // full of nulls the client has to interrogate.
  return bank === null && upi === null ? null : { bank, upi };
}

export function toPublicContact(property: PublicPropertyRecord): PublicContactView {
  return {
    phone: property.contactPhone,
    whatsappPhone: property.whatsappPhone,
    email: property.contactEmail,
    location: toPublicLocation(property),
    paymentDetails: toPublicPaymentDetails(property.settings),
  };
}

export function toPublicProperty(property: PublicPropertyRecord): PublicPropertyView {
  return {
    name: property.name,
    tagline: property.tagline,
    description: property.description,
    heroImageUrl: property.heroImageUrl,
    highlights: property.highlights,
    checkInInfo: property.checkInInfo,
    location: toPublicLocation(property),
    contact: toPublicContact(property),
  };
}

// ---------------------------------------------------------------------------
// Rooms and availability
// ---------------------------------------------------------------------------

/**
 * Individual rooms are collapsed into "room types" for the public view.
 *
 * A guest wants to know "what does a 3-sharing AC room cost, and is one free?",
 * not which specific rooms exist. Grouping is also what stops the payload from
 * being a floor plan: eight rooms become three offerings, and no row in the
 * response corresponds to a room somebody lives in.
 *
 * Rooms differing in price or air conditioning are genuinely different
 * offerings even when they share a label, so all three form the group key.
 */
export function groupRoomsIntoTypes(rooms: readonly PublicRoomRecord[]): PublicRoomTypeView[] {
  interface Group {
    readonly room: PublicRoomRecord;
    availableBeds: number;
    totalBeds: number;
  }

  const groups = new Map<string, Group>();

  for (const room of rooms) {
    const key = `${room.roomType}|${room.isAirConditioned ? 'ac' : 'non-ac'}|${String(room.monthlyRentPaise)}`;

    const available = room.beds.filter((bed) => bed.status === 'AVAILABLE').length;
    // A bed under maintenance or blocked is not on offer, so it belongs in
    // neither number — counting it in the total would advertise capacity the
    // property cannot actually sell.
    const offerable = room.beds.filter(
      (bed) => bed.status === 'AVAILABLE' || bed.status === 'OCCUPIED',
    ).length;

    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { room, availableBeds: available, totalBeds: offerable });
    } else {
      existing.availableBeds += available;
      existing.totalBeds += offerable;
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      name: group.room.roomType,
      capacity: group.room.capacity,
      isAirConditioned: group.room.isAirConditioned,
      monthlyRentPaise: group.room.monthlyRentPaise,
      description: group.room.description,
      facilities: group.room.facilities,
      availableBeds: group.availableBeds,
      totalBeds: group.totalBeds,
    }))
    .sort((a, b) => a.monthlyRentPaise - b.monthlyRentPaise || a.name.localeCompare(b.name));
}

export function toAvailability(
  roomTypes: readonly PublicRoomTypeView[],
): PublicAvailabilityView {
  const availableBeds = roomTypes.reduce((total, type) => total + type.availableBeds, 0);
  const totalBeds = roomTypes.reduce((total, type) => total + type.totalBeds, 0);

  // The advertised "from" price is the cheapest type that actually has a bed.
  // Quoting a price nobody can take today is the fastest way to lose the trust
  // of someone who then calls to ask about it.
  const withVacancy = roomTypes.filter((type) => type.availableBeds > 0);
  const priceable = withVacancy.length > 0 ? withVacancy : roomTypes;

  return {
    availableBeds,
    totalBeds,
    startingRentPaise:
      priceable.length === 0 ? null : Math.min(...priceable.map((type) => type.monthlyRentPaise)),
    byRoomType: roomTypes.map((type) => ({
      key: type.key,
      name: type.name,
      monthlyRentPaise: type.monthlyRentPaise,
      availableBeds: type.availableBeds,
      totalBeds: type.totalBeds,
    })),
  };
}

// ---------------------------------------------------------------------------
// Mess
// ---------------------------------------------------------------------------

export interface MenuSource {
  readonly timings: ReadonlyArray<{
    readonly mealType: MealTypeName;
    readonly startsAt: string;
    readonly endsAt: string;
  }>;
  readonly weekly: ReadonlyArray<{
    readonly dayOfWeek: number;
    readonly mealType: MealTypeName;
    readonly items: string[];
    readonly description: string | null;
  }>;
  readonly overrides: ReadonlyArray<{
    readonly mealType: MealTypeName;
    readonly items: string[];
    readonly description: string | null;
  }>;
}

export function toMealTimings(source: MenuSource['timings']): PublicMealTiming[] {
  const byType = new Map(source.map((timing) => [timing.mealType, timing]));

  // Ordered by MEAL_TYPES rather than by whatever the database returned, so
  // breakfast always precedes dinner regardless of insertion order.
  return MEAL_TYPES.flatMap((mealType) => {
    const timing = byType.get(mealType);
    return timing === undefined
      ? []
      : [{ mealType, startsAt: timing.startsAt, endsAt: timing.endsAt }];
  });
}

/**
 * Resolves one day's menu: a date-specific override replaces the weekly item
 * for that meal, and everything else falls through to the weekly menu.
 *
 * The override wins per MEAL, not per day — a festival lunch does not erase that
 * evening's usual dinner. Meals are emitted in MEAL_TYPES order so the screen
 * always reads breakfast, lunch, dinner.
 */
export function resolveDayMenu(
  source: MenuSource,
  dayOfWeek: number,
  date: DateOnly | null,
): PublicDayMenuView {
  const timings = new Map(toMealTimings(source.timings).map((timing) => [timing.mealType, timing]));

  const weeklyByMeal = new Map(
    source.weekly
      .filter((item) => item.dayOfWeek === dayOfWeek)
      .map((item) => [item.mealType, item] as const),
  );
  const overrideByMeal = new Map(source.overrides.map((item) => [item.mealType, item] as const));

  const meals: PublicMealView[] = MEAL_TYPES.flatMap((mealType) => {
    const override = overrideByMeal.get(mealType);
    const weekly = weeklyByMeal.get(mealType);
    const chosen = override ?? weekly;

    // A meal with nothing published is omitted rather than rendered as an empty
    // card — "no dinner listed" and "dinner: nothing" are different claims, and
    // only the first one is true.
    if (chosen === undefined || chosen.items.length === 0) return [];

    return [
      {
        mealType,
        items: chosen.items,
        description: chosen.description,
        timing: timings.get(mealType) ?? null,
        isSpecial: override !== undefined,
      },
    ];
  });

  return {
    date,
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek] ?? `Day ${String(dayOfWeek)}`,
    meals,
  };
}

// ---------------------------------------------------------------------------
// Facilities, gallery, rules
// ---------------------------------------------------------------------------

/**
 * An unrecognised icon key becomes null rather than being passed through.
 *
 * The client maps keys to glyphs from a fixed table; forwarding an unknown key
 * would either render nothing or hand the client an arbitrary backend-supplied
 * symbol name. Null is honest, and the client already has a neutral default.
 */
function toIconKey(value: string | null): FacilityIconKey | null {
  return isFacilityIconKey(value) ? value : null;
}

export function toPublicFacility(facility: {
  name: string;
  description: string | null;
  iconKey: string | null;
}): PublicFacilityView {
  return {
    name: facility.name,
    description: facility.description,
    iconKey: toIconKey(facility.iconKey),
  };
}

export function toPublicGalleryImage(photo: {
  url: string;
  caption: string | null;
}): PublicGalleryImageView {
  return { url: photo.url, caption: photo.caption };
}

export function toPublicRule(rule: { title: string; description: string }): PublicRuleView {
  return { title: rule.title, description: rule.description };
}
