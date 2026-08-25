import { describe, expect, it } from 'vitest';

import { toPublicPropertyDetail } from '../src/modules/public/public.mapper.js';
import type { PublicPropertyRecord } from '../src/modules/public/public.repository.js';

/**
 * These tests guard the public/private boundary.
 *
 * The guest experience is the one surface with no authentication, so a field
 * that escapes here is exposed to the whole internet. The assertions are
 * deliberately about what is ABSENT, not only about what is present.
 */
function buildRecord(overrides: Partial<PublicPropertyRecord> = {}): PublicPropertyRecord {
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
    latitude: { toString: () => '18.507600' } as unknown as PublicPropertyRecord['latitude'],
    longitude: { toString: () => '73.807600' } as unknown as PublicPropertyRecord['longitude'],
    contactPhone: '+919876543210',
    contactEmail: 'stay@example.in',
    photos: [{ url: 'https://cdn.example/1.jpg', caption: 'Lobby' }],
    facilities: [{ label: 'Wi-Fi', icon: 'wifi' }],
    rules: [{ text: 'No smoking' }],
    rooms: [
      {
        roomType: '3 Sharing',
        capacity: 3,
        monthlyRentPaise: 700_000,
        isAirConditioned: false,
        description: 'Popular',
        facilities: ['Fan'],
        beds: [{ status: 'OCCUPIED' }, { status: 'AVAILABLE' }, { status: 'AVAILABLE' }],
      },
      {
        roomType: '3 Sharing',
        capacity: 3,
        monthlyRentPaise: 700_000,
        isAirConditioned: false,
        description: 'Popular',
        facilities: ['Fan'],
        beds: [{ status: 'OCCUPIED' }, { status: 'MAINTENANCE' }, { status: 'BLOCKED' }],
      },
      {
        roomType: 'Single',
        capacity: 1,
        monthlyRentPaise: 1_450_000,
        isAirConditioned: true,
        description: null,
        facilities: [],
        beds: [{ status: 'AVAILABLE' }],
      },
    ],
    mealTimings: [{ mealType: 'BREAKFAST', startsAt: '08:00', endsAt: '09:30' }],
    menuItems: [
      { dayOfWeek: 2, mealType: 'LUNCH', items: ['Rajma', 'Rice'] },
      { dayOfWeek: 1, mealType: 'BREAKFAST', items: ['Poha'] },
      { dayOfWeek: 1, mealType: 'LUNCH', items: ['Dal'] },
    ],
    settings: {
      paymentDetailsArePublic: false,
      bankAccountName: 'Heaven Hospitality',
      bankAccountNumber: '1234567890',
      bankIfsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiId: 'heaven@upi',
      upiQrImageUrl: 'https://cdn.example/qr.png',
    },
    ...overrides,
  } as PublicPropertyRecord;
}

describe('public property payload', () => {
  const view = toPublicPropertyDetail(buildRecord());
  const serialised = JSON.stringify(view);

  it('never exposes room numbers, floors, bed identities or database ids', () => {
    // Precise availability is a map of where people live.
    //
    // "label" is deliberately NOT in this list: facilities legitimately have
    // labels. Bed labels are covered by the room-type allowlist below, which is
    // the stronger check anyway.
    for (const key of ['id', 'roomId', 'bedId', 'number', 'floorId', 'floor', 'beds', 'status']) {
      expect(serialised, `"${key}" must not appear in a public payload`).not.toContain(`"${key}"`);
    }
  });

  it('exposes exactly the agreed room-type fields and nothing more', () => {
    // An allowlist, not a denylist: a column added to Room later cannot reach the
    // public API without this test failing first.
    for (const roomType of view.roomTypes) {
      expect(Object.keys(roomType).sort()).toEqual([
        'availableBeds',
        'capacity',
        'description',
        'facilities',
        'isAirConditioned',
        'name',
        'rentPaise',
      ]);
    }
  });

  it('groups identical room types and sums their availability', () => {
    const shared = view.roomTypes.find((type) => type.name === '3 Sharing');
    // Two rooms of this type: 2 free in the first, 0 offerable in the second
    // (maintenance and blocked beds are not availability).
    expect(shared?.availableBeds).toBe(2);
    expect(view.roomTypes).toHaveLength(2);
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
    }
    expect(serialised).not.toContain('₹');
  });

  it('hides bank and UPI details unless the owner published them', () => {
    // The default is private: sharing an account number is a deliberate act.
    expect(view.paymentDetails).toBeNull();
    expect(serialised).not.toContain('1234567890');
    expect(serialised).not.toContain('heaven@upi');
  });

  it('shows payment details once the owner marks them public', () => {
    const published = toPublicPropertyDetail(
      buildRecord({
        settings: {
          paymentDetailsArePublic: true,
          bankAccountName: 'Heaven Hospitality',
          bankAccountNumber: '1234567890',
          bankIfsc: 'HDFC0001234',
          bankName: 'HDFC Bank',
          upiId: 'heaven@upi',
          upiQrImageUrl: 'https://cdn.example/qr.png',
        } as PublicPropertyRecord['settings'],
      }),
    );

    expect(published.paymentDetails?.upiId).toBe('heaven@upi');
  });

  it('groups the menu by day in week order', () => {
    expect(view.menu.map((day) => day.dayOfWeek)).toEqual([1, 2]);
    expect(view.menu[0]?.meals).toHaveLength(2);
  });

  it('keeps contact, timings and location, which a guest legitimately needs', () => {
    expect(view.contact.phone).toBe('+919876543210');
    expect(view.location).toEqual({ latitude: 18.5076, longitude: 73.8076 });
    expect(view.mealTimings[0]).toEqual({
      mealType: 'BREAKFAST',
      startsAt: '08:00',
      endsAt: '09:30',
    });
  });

  it('handles a property with nothing configured yet', () => {
    const empty = toPublicPropertyDetail(
      buildRecord({
        photos: [],
        rooms: [],
        menuItems: [],
        mealTimings: [],
        latitude: null,
        longitude: null,
      }),
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
        rooms: [
          {
            roomType: 'Full',
            capacity: 2,
            monthlyRentPaise: 100,
            isAirConditioned: false,
            description: null,
            facilities: [],
            beds: [{ status: 'OCCUPIED' }, { status: 'OCCUPIED' }],
          },
        ] as PublicPropertyRecord['rooms'],
      }),
    );

    expect(full.availableBeds).toBe(0);
  });
});
