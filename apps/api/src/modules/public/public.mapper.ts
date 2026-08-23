import type {
  PublicPropertyDetail,
  PublicPropertySummary,
  PublicRoomTypeView,
} from '@heaven/contracts';
import type { BedStatus, MealType } from '@prisma/client';

/**
 * Response shapes for the guest experience.
 *
 * This module has its OWN mappers and never reuses an admin or tenant serializer.
 * Reusing one is how tenant PII leaks: a column added for operations would
 * silently widen the public API. See docs/0004-authorization.md.
 *
 * Nothing here carries a database id. Properties are addressed by slug; rooms,
 * beds and tenants are never identified publicly at all.
 */

/** The shape the repository hands over. Narrower than the Prisma model on purpose. */
export interface PropertyRecord {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  addressLine: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  latitude: { toString(): string } | null;
  longitude: { toString(): string } | null;
  contactPhone: string;
  contactEmail: string | null;
  photos: Array<{ url: string; caption: string | null }>;
  facilities: Array<{ label: string; icon: string | null }>;
  rules: Array<{ text: string }>;
  roomTypes: Array<{
    id: string;
    name: string;
    sharingCapacity: number;
    baseRentPaise: number;
    depositPaise: number;
    description: string | null;
    amenities: string[];
    rooms: Array<{ beds: Array<{ status: BedStatus }> }>;
  }>;
  menuItems: Array<{ dayOfWeek: number; mealType: MealType; items: string[] }>;
}

function countAvailableBeds(roomType: PropertyRecord['roomTypes'][number]): number {
  return roomType.rooms.reduce(
    (total, room) => total + room.beds.filter((bed) => bed.status === 'AVAILABLE').length,
    0,
  );
}

function toRoomTypeView(roomType: PropertyRecord['roomTypes'][number]): PublicRoomTypeView {
  return {
    name: roomType.name,
    sharingCapacity: roomType.sharingCapacity,
    rentPaise: roomType.baseRentPaise,
    depositPaise: roomType.depositPaise,
    description: roomType.description,
    amenities: roomType.amenities,
    availableBeds: countAvailableBeds(roomType),
  };
}

export type { PublicPropertyDetail, PublicPropertySummary, PublicRoomTypeView };

export function toPublicPropertyDetail(property: PropertyRecord): PublicPropertyDetail {
  const roomTypes = property.roomTypes.map(toRoomTypeView);
  const availableBeds = roomTypes.reduce((total, type) => total + type.availableBeds, 0);

  const rentQuotes = roomTypes.map((type) => type.rentPaise);
  const startingRentPaise = rentQuotes.length > 0 ? Math.min(...rentQuotes) : null;

  const menuByDay = new Map<number, Array<{ mealType: MealType; items: string[] }>>();
  for (const item of property.menuItems) {
    const meals = menuByDay.get(item.dayOfWeek) ?? [];
    meals.push({ mealType: item.mealType, items: item.items });
    menuByDay.set(item.dayOfWeek, meals);
  }

  return {
    slug: property.slug,
    name: property.name,
    tagline: property.tagline,
    description: property.description,
    locality: property.locality,
    city: property.city,
    coverPhotoUrl: property.photos[0]?.url ?? null,
    startingRentPaise,
    availableBeds,
    address: {
      line: property.addressLine,
      locality: property.locality,
      city: property.city,
      state: property.state,
      pincode: property.pincode,
    },
    location:
      property.latitude === null || property.longitude === null
        ? null
        : {
            latitude: Number(property.latitude.toString()),
            longitude: Number(property.longitude.toString()),
          },
    contact: { phone: property.contactPhone, email: property.contactEmail },
    photos: property.photos.map((photo) => ({ url: photo.url, caption: photo.caption })),
    facilities: property.facilities.map((f) => ({ label: f.label, icon: f.icon })),
    rules: property.rules.map((rule) => rule.text),
    roomTypes,
    menu: [...menuByDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dayOfWeek, meals]) => ({ dayOfWeek, meals })),
  };
}

export function toPublicPropertySummary(property: PropertyRecord): PublicPropertySummary {
  const detail = toPublicPropertyDetail(property);
  return {
    slug: detail.slug,
    name: detail.name,
    tagline: detail.tagline,
    locality: detail.locality,
    city: detail.city,
    coverPhotoUrl: detail.coverPhotoUrl,
    startingRentPaise: detail.startingRentPaise,
    availableBeds: detail.availableBeds,
  };
}
