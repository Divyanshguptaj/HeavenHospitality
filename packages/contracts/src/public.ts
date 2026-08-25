import type { MealTypeName } from './domain.js';

/**
 * The guest (unauthenticated) API contract.
 *
 * This is the one surface with no authentication in front of it, so a field
 * added here is exposed to the whole internet. Nothing carries a database id:
 * properties are addressed by slug, and rooms, beds and residents are never
 * identified publicly at all.
 *
 * Money is integer paise (docs/0002-money.md).
 */

/** Rooms grouped for public display — never individual rooms or beds. */
export interface PublicRoomTypeView {
  /** e.g. "3 Sharing". */
  readonly name: string;
  readonly capacity: number;
  readonly isAirConditioned: boolean;
  readonly rentPaise: number;
  readonly description: string | null;
  readonly facilities: readonly string[];
  /** Coarse by design: a count of free beds, never which beds or which rooms. */
  readonly availableBeds: number;
}

export interface PublicPaymentDetails {
  readonly bankAccountName: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIfsc: string | null;
  readonly bankName: string | null;
  readonly upiId: string | null;
  readonly upiQrImageUrl: string | null;
}

export interface PublicMealTiming {
  readonly mealType: MealTypeName;
  readonly startsAt: string;
  readonly endsAt: string;
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

export interface PublicPropertyDetail extends PublicPropertySummary {
  readonly description: string | null;
  readonly address: {
    readonly line: string;
    readonly locality: string;
    readonly city: string;
    readonly state: string;
    readonly pincode: string;
  };
  readonly location: { readonly latitude: number; readonly longitude: number } | null;
  readonly contact: { readonly phone: string; readonly email: string | null };
  readonly photos: ReadonlyArray<{ readonly url: string; readonly caption: string | null }>;
  readonly facilities: ReadonlyArray<{ readonly label: string; readonly icon: string | null }>;
  readonly rules: readonly string[];
  readonly roomTypes: readonly PublicRoomTypeView[];
  readonly mealTimings: readonly PublicMealTiming[];
  readonly menu: ReadonlyArray<{
    readonly dayOfWeek: number;
    readonly meals: ReadonlyArray<{
      readonly mealType: MealTypeName;
      readonly items: readonly string[];
    }>;
  }>;
  /**
   * Present only when the owner has explicitly marked payment details public
   * (spec §2.1, §13). Null otherwise — never an empty object, so the client
   * cannot mistake "not shared" for "not configured".
   */
  readonly paymentDetails: PublicPaymentDetails | null;
}
