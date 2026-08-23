/**
 * The guest (unauthenticated) API contract.
 *
 * Shared so the API's mapper and the mobile app describe the same payload. If a
 * field is added here it must be added deliberately on both sides — which is the
 * point, because this is the one surface with no authentication in front of it.
 *
 * Money is integer paise (docs/0002-money.md). Nothing here carries a database
 * id: properties are addressed by slug, and rooms, beds and tenants are never
 * identified publicly at all.
 */

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'] as const;
export type MealTypeName = (typeof MEAL_TYPES)[number];

/** ISO-8601 day numbering: 1 = Monday … 7 = Sunday. */
export const DAY_NAMES: Readonly<Record<number, string>> = Object.freeze({
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
});

export const MEAL_LABELS: Readonly<Record<MealTypeName, string>> = Object.freeze({
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  SNACKS: 'Snacks',
  DINNER: 'Dinner',
});

export interface PublicRoomTypeView {
  readonly name: string;
  readonly sharingCapacity: number;
  readonly rentPaise: number;
  readonly depositPaise: number;
  readonly description: string | null;
  readonly amenities: readonly string[];
  /** Coarse by design: a count of free beds, never which beds or which rooms. */
  readonly availableBeds: number;
}

export interface PublicPropertySummary {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly locality: string;
  readonly city: string;
  readonly coverPhotoUrl: string | null;
  readonly startingRentPaise: number | null;
  readonly availableBeds: number;
}

export interface PublicPropertyAddress {
  readonly line: string;
  readonly locality: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

export interface PublicPropertyDetail extends PublicPropertySummary {
  readonly description: string | null;
  readonly address: PublicPropertyAddress;
  readonly location: { readonly latitude: number; readonly longitude: number } | null;
  readonly contact: { readonly phone: string; readonly email: string | null };
  readonly photos: ReadonlyArray<{ readonly url: string; readonly caption: string | null }>;
  readonly facilities: ReadonlyArray<{ readonly label: string; readonly icon: string | null }>;
  readonly rules: readonly string[];
  readonly roomTypes: readonly PublicRoomTypeView[];
  readonly menu: ReadonlyArray<{
    readonly dayOfWeek: number;
    readonly meals: ReadonlyArray<{
      readonly mealType: MealTypeName;
      readonly items: readonly string[];
    }>;
  }>;
}
