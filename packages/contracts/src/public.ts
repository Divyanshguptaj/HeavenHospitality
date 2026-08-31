import { z } from 'zod';

import type { MealTypeName } from './domain.js';

/**
 * The public API contract — what a guest, a signed-in NON_RESIDENT and a
 * RESIDENT all see.
 *
 * This is the one surface with no authentication in front of it, so a field
 * added here is exposed to the whole internet. Two rules hold everywhere below:
 *
 *   1. Nothing carries a database id. Rooms, beds, residents and photos are
 *      never identified publicly, so a payload can never be used to address a
 *      private record or to map the building.
 *   2. Availability is a COUNT. "3 beds free" is what a prospective resident
 *      needs; "Room 202 bed B is free" is a map of where people live.
 *
 * Money is integer paise (docs/0002-money.md), never a formatted string.
 */

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/**
 * The icon vocabulary the backend may use for a facility.
 *
 * A closed list, validated on the way in and mapped to a glyph by the client.
 * The database stores a MEANING ("wifi"), never a component or icon-font name —
 * a backend that can name a client symbol is a backend that can decide what the
 * client renders. Anything outside this list degrades to a neutral default.
 */
export const FACILITY_ICON_KEYS = [
  'wifi',
  'meals',
  'laundry',
  'housekeeping',
  'power-backup',
  'security',
  'hot-water',
  'study',
  'ac',
  'parking',
  'water',
  'gym',
  'tv',
  'lift',
] as const;
export type FacilityIconKey = (typeof FACILITY_ICON_KEYS)[number];

export function isFacilityIconKey(value: string | null): value is FacilityIconKey {
  return value !== null && (FACILITY_ICON_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Query schemas
//
// Public does not mean unvalidated. Every query parameter below is bounded, so
// an unauthenticated caller cannot ask for an unbounded page or an arbitrary
// date range.
// ---------------------------------------------------------------------------

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday, matching the database. */
export const dayOfWeekSchema = z.coerce.number().int().min(1).max(7);

export const publicGalleryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type PublicGalleryQuery = z.infer<typeof publicGalleryQuerySchema>;

export const publicMenuDayQuerySchema = z.object({
  /**
   * Optional. Absent means "today in the property's timezone", which is the
   * only date a client should normally need — the server owns what "today" is,
   * because a device clock is neither trustworthy nor in the right timezone.
   */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')
    .optional(),
});
export type PublicMenuDayQuery = z.infer<typeof publicMenuDayQuerySchema>;

// ---------------------------------------------------------------------------
// Property, contact and location
// ---------------------------------------------------------------------------

export interface PublicAddress {
  readonly line: string;
  readonly locality: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

export interface PublicCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PublicLocationView {
  readonly address: PublicAddress;
  /** Null when the owner has not recorded coordinates. */
  readonly coordinates: PublicCoordinates | null;
  /**
   * A maps deep link, built by the SERVER from the address or coordinates.
   *
   * Built once, server-side, so every client opens the same place and no screen
   * has to reimplement the URL. It needs no Maps API key: it is a search URL the
   * device's own map application handles.
   */
  readonly mapsUrl: string;
}

/**
 * Bank and UPI details, and ONLY the ones the owner has published.
 *
 * The two halves are governed by separate switches, and a hidden half is
 * absent from the response entirely rather than nulled out — the API does not
 * send data for the client to hide.
 */
export interface PublicPaymentDetails {
  readonly bank: {
    readonly accountName: string | null;
    readonly accountNumber: string | null;
    readonly ifsc: string | null;
    readonly bankName: string | null;
  } | null;
  readonly upi: {
    readonly upiId: string | null;
    readonly qrImageUrl: string | null;
  } | null;
}

export interface PublicPropertyView {
  readonly name: string;
  readonly tagline: string | null;
  readonly description: string | null;
  readonly heroImageUrl: string | null;
  readonly highlights: readonly string[];
  readonly checkInInfo: string | null;
  readonly location: PublicLocationView;
  readonly contact: PublicContactView;
}

export interface PublicContactView {
  readonly phone: string;
  /** Null means there is no WhatsApp channel — never "reuse the phone number". */
  readonly whatsappPhone: string | null;
  readonly email: string | null;
  readonly location: PublicLocationView;
  /** Null when the owner publishes neither bank nor UPI details. */
  readonly paymentDetails: PublicPaymentDetails | null;
}

// ---------------------------------------------------------------------------
// Rooms and availability
// ---------------------------------------------------------------------------

/** Rooms grouped for public display — never individual rooms or beds. */
export interface PublicRoomTypeView {
  /**
   * Stable within a response and derived from the room type's public attributes,
   * so a client can key a list without the server exposing a database id.
   */
  readonly key: string;
  /** e.g. "3 Sharing". */
  readonly name: string;
  readonly capacity: number;
  readonly isAirConditioned: boolean;
  readonly monthlyRentPaise: number;
  readonly description: string | null;
  readonly facilities: readonly string[];
  /** Coarse by design: a count of free beds, never which beds or which rooms. */
  readonly availableBeds: number;
  /** Total offerable beds of this type. Gives "3 of 12 free" its denominator. */
  readonly totalBeds: number;
}

export interface PublicAvailabilityView {
  readonly availableBeds: number;
  readonly totalBeds: number;
  readonly startingRentPaise: number | null;
  readonly byRoomType: ReadonlyArray<{
    readonly key: string;
    readonly name: string;
    readonly monthlyRentPaise: number;
    readonly availableBeds: number;
    readonly totalBeds: number;
  }>;
}

export interface PublicRoomsView {
  readonly roomTypes: readonly PublicRoomTypeView[];
  readonly availability: PublicAvailabilityView;
}

// ---------------------------------------------------------------------------
// Mess
// ---------------------------------------------------------------------------

export interface PublicMealTiming {
  readonly mealType: MealTypeName;
  /** Local "HH:mm" in the property's timezone. */
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface PublicMealView {
  readonly mealType: MealTypeName;
  readonly items: readonly string[];
  readonly description: string | null;
  readonly timing: PublicMealTiming | null;
  /**
   * True when a date-specific override replaced the usual weekly menu, so the UI
   * can say "special today" rather than silently showing something different
   * from the weekly menu on the next screen.
   */
  readonly isSpecial: boolean;
}

export interface PublicDayMenuView {
  /** ISO date in the property's timezone. Null on the weekly view. */
  readonly date: string | null;
  /** ISO-8601 weekday: 1 = Monday … 7 = Sunday. */
  readonly dayOfWeek: number;
  readonly dayName: string;
  readonly meals: readonly PublicMealView[];
}

export interface PublicWeekMenuView {
  /** Which weekday is "today" for the property, so the client need not guess. */
  readonly todayDayOfWeek: number;
  readonly timings: readonly PublicMealTiming[];
  readonly days: readonly PublicDayMenuView[];
}

// ---------------------------------------------------------------------------
// Facilities, gallery, rules
// ---------------------------------------------------------------------------

export interface PublicFacilityView {
  readonly name: string;
  readonly description: string | null;
  /** One of FACILITY_ICON_KEYS, or null when unrecognised. */
  readonly iconKey: FacilityIconKey | null;
}

export interface PublicGalleryImageView {
  readonly url: string;
  readonly caption: string | null;
}

export interface PublicGalleryView {
  readonly images: readonly PublicGalleryImageView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface PublicRuleView {
  readonly title: string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/**
 * Everything the landing screen shows, in one request.
 *
 * A composite deliberately: the home screen is what every first-time visitor
 * loads, and four round-trips on a phone network is the difference between a
 * screen that appears and a screen that assembles itself. The detail screens
 * behind it each have their own endpoint.
 */
export interface PublicHomeView {
  readonly property: PublicPropertyView;
  readonly availability: PublicAvailabilityView;
  /** The first few room types by price, as a preview. Full list at /public/rooms. */
  readonly roomTypePreview: readonly PublicRoomTypeView[];
  /** Today's meals, resolved against any date-specific override. */
  readonly todayMenu: PublicDayMenuView;
  readonly facilityPreview: readonly PublicFacilityView[];
  readonly galleryPreview: readonly PublicGalleryImageView[];
  readonly facilityCount: number;
  readonly galleryCount: number;
}
