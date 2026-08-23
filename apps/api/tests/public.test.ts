import { describe, expect, it } from 'vitest';

import {
  toPublicPropertyDetail,
  type PropertyRecord,
} from '../src/modules/public/public.mapper.js';

/**
 * These tests guard the public/private boundary.
 *
 * The guest experience is the one surface with no authentication, so a field that
 * escapes here is exposed to the whole internet. The assertions below are
 * deliberately about what is ABSENT, not only about what is present.
 */
function buildRecord(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  return {
    slug: 'heaven-test',
    name: 'Heaven Test',
    tagline: 'A place',
    description: 'Description',
    addressLine: 'Plot 14',
    locality: 'Kothrud',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411038',
    latitude: { toString: () => '18.507600' },
    longitude: { toString: () => '73.807600' },
    contactPhone: '+919876543210',
    contactEmail: 'stay@example.in',
    photos: [{ url: 'https://cdn.example/1.jpg', caption: 'Lobby' }],
    facilities: [{ label: 'Wi-Fi', icon: 'wifi' }],
    rules: [{ text: 'No smoking' }],
    roomTypes: [
      {
        id: 'room-type-id-must-not-leak',
        name: 'Three Sharing (Non-AC)',
        sharingCapacity: 3,
        baseRentPaise: 700_000,
        depositPaise: 1_400_000,
        description: 'Popular',
        amenities: ['Fan'],
        rooms: [
          { beds: [{ status: 'OCCUPIED' }, { status: 'AVAILABLE' }, { status: 'AVAILABLE' }] },
          { beds: [{ status: 'OCCUPIED' }, { status: 'MAINTENANCE' }, { status: 'RESERVED' }] },
        ],
      },
      {
        id: 'another-id',
        name: 'Single Occupancy (AC)',
        sharingCapacity: 1,
        baseRentPaise: 1_450_000,
        depositPaise: 2_900_000,
        description: null,
        amenities: [],
        rooms: [{ beds: [{ status: 'AVAILABLE' }] }],
      },
    ],
    menuItems: [
      { dayOfWeek: 2, mealType: 'LUNCH', items: ['Rajma', 'Rice'] },
      { dayOfWeek: 1, mealType: 'BREAKFAST', items: ['Poha'] },
      { dayOfWeek: 1, mealType: 'LUNCH', items: ['Dal'] },
    ],
    ...overrides,
  };
}

describe('public property payload', () => {
  const view = toPublicPropertyDetail(buildRecord());
  const serialised = JSON.stringify(view);

  it('never exposes a database identifier', () => {
    // Properties are addressed by slug; rooms, beds and room types are never
    // identified publicly at all.
    expect(serialised).not.toContain('room-type-id-must-not-leak');
    expect(serialised).not.toContain('another-id');
    expect(view).not.toHaveProperty('id');
    for (const roomType of view.roomTypes) {
      expect(roomType).not.toHaveProperty('id');
    }
  });

  it('never exposes room numbers, floors, blocks or individual beds', () => {
    // Precise availability is a map of where people live.
    for (const key of ['roomNumber', 'floor', 'block', 'bedId', 'rooms', 'beds']) {
      expect(serialised, `"${key}" must not appear in a public payload`).not.toContain(`"${key}"`);
    }
  });

  it('exposes exactly the agreed room-type fields and nothing more', () => {
    // An allowlist rather than a denylist: a column added to RoomType later
    // cannot reach the public API without this test failing first.
    for (const roomType of view.roomTypes) {
      expect(Object.keys(roomType).sort()).toEqual([
        'amenities',
        'availableBeds',
        'depositPaise',
        'description',
        'name',
        'rentPaise',
        'sharingCapacity',
      ]);
    }
  });

  it('reports availability only as a coarse count per room type', () => {
    const shared = view.roomTypes.find((type) => type.sharingCapacity === 3);
    // Two AVAILABLE beds; OCCUPIED, MAINTENANCE and RESERVED are not offerable.
    expect(shared?.availableBeds).toBe(2);
    expect(typeof shared?.availableBeds).toBe('number');
  });

  it('totals availability across room types', () => {
    expect(view.availableBeds).toBe(3);
  });

  it('advertises the lowest rent as the starting price', () => {
    expect(view.startingRentPaise).toBe(700_000);
  });

  it('exposes money as integer paise, never a formatted string', () => {
    for (const roomType of view.roomTypes) {
      expect(Number.isInteger(roomType.rentPaise)).toBe(true);
      expect(Number.isInteger(roomType.depositPaise)).toBe(true);
    }
    expect(serialised).not.toContain('₹');
  });

  it('groups the menu by day in week order', () => {
    expect(view.menu.map((day) => day.dayOfWeek)).toEqual([1, 2]);
    expect(view.menu[0]?.meals).toHaveLength(2);
  });

  it('keeps contact and location, which a guest legitimately needs', () => {
    expect(view.contact.phone).toBe('+919876543210');
    expect(view.location).toEqual({ latitude: 18.5076, longitude: 73.8076 });
  });

  it('handles a property with no photos, coordinates or room types', () => {
    const empty = toPublicPropertyDetail(
      buildRecord({ photos: [], roomTypes: [], latitude: null, longitude: null, menuItems: [] }),
    );

    expect(empty.coverPhotoUrl).toBeNull();
    expect(empty.location).toBeNull();
    expect(empty.startingRentPaise).toBeNull();
    expect(empty.availableBeds).toBe(0);
    expect(empty.menu).toEqual([]);
  });

  it('reports zero availability when every bed is taken', () => {
    const full = toPublicPropertyDetail(
      buildRecord({
        roomTypes: [
          {
            id: 'x',
            name: 'Full',
            sharingCapacity: 2,
            baseRentPaise: 100,
            depositPaise: 100,
            description: null,
            amenities: [],
            rooms: [{ beds: [{ status: 'OCCUPIED' }, { status: 'OCCUPIED' }] }],
          },
        ],
      }),
    );

    expect(full.availableBeds).toBe(0);
    expect(full.roomTypes[0]?.availableBeds).toBe(0);
  });
});
