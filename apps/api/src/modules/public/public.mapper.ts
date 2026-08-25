import type {
  PublicPropertyDetail,
  PublicPropertySummary,
  PublicRoomTypeView,
} from '@heaven/contracts';
import type { MealType } from '@prisma/client';

import type { PublicPropertyRecord } from './public.repository.js';

/**
 * Response mapping for the guest experience.
 *
 * This module has its OWN mappers and never reuses an owner or resident
 * serializer. Reusing one is how resident PII leaks: a column added for
 * operations would silently widen the public API. See docs/0004-authorization.md.
 *
 * Nothing here carries a database id. Properties are addressed by slug; rooms,
 * beds and residents are never identified publicly at all.
 */

type RoomRecord = PublicPropertyRecord['rooms'][number];

/**
 * Individual rooms are collapsed into "room types" for the public view.
 *
 * A guest wants to know "what does a 3-sharing AC room cost and is one free?",
 * not which specific rooms exist. Grouping also means the payload cannot be used
 * to map the building.
 */
function groupRoomsIntoTypes(rooms: readonly RoomRecord[]): PublicRoomTypeView[] {
  const groups = new Map<string, { room: RoomRecord; availableBeds: number }>();

  for (const room of rooms) {
    // Rooms differing in price or AC are genuinely different offerings even when
    // they share a label, so all three form the key.
    const key = `${room.roomType}|${String(room.isAirConditioned)}|${String(room.monthlyRentPaise)}`;
    const available = room.beds.filter((bed) => bed.status === 'AVAILABLE').length;
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { room, availableBeds: available });
    } else {
      existing.availableBeds += available;
    }
  }

  return [...groups.values()]
    .map(({ room, availableBeds }) => ({
      name: room.roomType,
      capacity: room.capacity,
      isAirConditioned: room.isAirConditioned,
      rentPaise: room.monthlyRentPaise,
      description: room.description,
      facilities: room.facilities,
      availableBeds,
    }))
    .sort((a, b) => a.rentPaise - b.rentPaise);
}

export function toPublicPropertyDetail(property: PublicPropertyRecord): PublicPropertyDetail {
  const roomTypes = groupRoomsIntoTypes(property.rooms);
  const availableBeds = roomTypes.reduce((total, type) => total + type.availableBeds, 0);
  const rents = roomTypes.map((type) => type.rentPaise);

  const menuByDay = new Map<number, Array<{ mealType: MealType; items: string[] }>>();
  for (const item of property.menuItems) {
    const meals = menuByDay.get(item.dayOfWeek) ?? [];
    meals.push({ mealType: item.mealType, items: item.items });
    menuByDay.set(item.dayOfWeek, meals);
  }

  const settings = property.settings;

  return {
    slug: property.slug,
    name: property.name,
    tagline: property.tagline,
    description: property.description,
    locality: property.locality,
    city: property.city,
    coverPhotoUrl: property.photos[0]?.url ?? null,
    startingRentPaise: rents.length > 0 ? Math.min(...rents) : null,
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
    mealTimings: property.mealTimings.map((timing) => ({
      mealType: timing.mealType,
      startsAt: timing.startsAt,
      endsAt: timing.endsAt,
    })),
    menu: [...menuByDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dayOfWeek, meals]) => ({ dayOfWeek, meals })),
    // Bank and UPI details reach guests ONLY when the owner has explicitly
    // published them. Null — not an empty object — so "not shared" is
    // distinguishable from "not configured".
    paymentDetails:
      settings !== null && settings.paymentDetailsArePublic
        ? {
            bankAccountName: settings.bankAccountName,
            bankAccountNumber: settings.bankAccountNumber,
            bankIfsc: settings.bankIfsc,
            bankName: settings.bankName,
            upiId: settings.upiId,
            upiQrImageUrl: settings.upiQrImageUrl,
          }
        : null,
  };
}

export function toPublicPropertySummary(property: PublicPropertyRecord): PublicPropertySummary {
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
