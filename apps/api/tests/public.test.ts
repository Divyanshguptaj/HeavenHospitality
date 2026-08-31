import { describe, expect, it } from 'vitest';

import {
  buildMapsUrl,
  groupRoomsIntoTypes,
  resolveDayMenu,
  toAvailability,
  toMealTimings,
  toPublicContact,
  toPublicFacility,
  toPublicProperty,
  type MenuSource,
} from '../src/modules/public/public.mapper.js';
import type {
  PublicPropertyRecord,
  PublicRoomRecord,
} from '../src/modules/public/public.repository.js';

/**
 * These tests guard the public/private boundary.
 *
 * The public API is the one surface with no authentication, so a field that
 * escapes here is exposed to the whole internet. The assertions are deliberately
 * about what is ABSENT as much as about what is present — an allowlist test
 * fails when someone adds a column, which is exactly when a human should look.
 */

const decimal = (value: string) =>
  ({ toString: () => value }) as unknown as PublicPropertyRecord['latitude'];

function buildProperty(overrides: Partial<PublicPropertyRecord> = {}): PublicPropertyRecord {
  return {
    name: 'Heaven Test',
    tagline: 'A place',
    description: 'Description',
    heroImageUrl: 'https://cdn.example/hero.jpg',
    highlights: ['Walk to campus'],
    checkInInfo: 'Visit between 9 and 8.',
    timezone: 'Asia/Kolkata',
    addressLine: 'Plot 14',
    locality: 'Kothrud',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411038',
    latitude: decimal('18.507600'),
    longitude: decimal('73.807600'),
    contactPhone: '+919876543210',
    whatsappPhone: '+919876543211',
    contactEmail: 'stay@example.in',
    settings: {
      showBankDetailsPublicly: false,
      showUpiPublicly: false,
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

const ROOMS: PublicRoomRecord[] = [
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
] as PublicRoomRecord[];

describe('public property payload', () => {
  const property = toPublicProperty(buildProperty());
  const serialised = JSON.stringify(property);

  it('never carries a database id', () => {
    // Nothing public is addressed by id. A payload that contains one is a
    // payload that can be used to reach a private record.
    for (const key of ['id', 'propertyId', 'roomId', 'bedId', 'userId', 'tenancyId']) {
      expect(serialised, `"${key}" must not appear in a public payload`).not.toContain(`"${key}"`);
    }
  });

  it('keeps the contact and location a guest legitimately needs', () => {
    expect(property.contact.phone).toBe('+919876543210');
    expect(property.contact.whatsappPhone).toBe('+919876543211');
    expect(property.location.coordinates).toEqual({ latitude: 18.5076, longitude: 73.8076 });
  });

  it('distinguishes "no WhatsApp" from "same as the phone"', () => {
    // Silently reusing contactPhone would send enquiries to a number nobody
    // watches on WhatsApp.
    const withoutWhatsapp = toPublicProperty(buildProperty({ whatsappPhone: null }));
    expect(withoutWhatsapp.contact.whatsappPhone).toBeNull();
  });
});

describe('maps link', () => {
  it('prefers coordinates when the owner recorded them', () => {
    const url = buildMapsUrl(buildProperty());
    expect(url).toContain(encodeURIComponent('18.507600,73.807600'));
  });

  it('falls back to the written address', () => {
    const url = buildMapsUrl(buildProperty({ latitude: null, longitude: null }));
    expect(url).toContain(encodeURIComponent('Plot 14'));
    expect(url).toContain(encodeURIComponent('411038'));
  });

  it('escapes owner-entered text so an address cannot break the URL', () => {
    const url = buildMapsUrl(
      buildProperty({ latitude: null, longitude: null, addressLine: 'A&B #7?x=1' }),
    );

    // The raw characters would otherwise terminate the query or add parameters.
    expect(url).not.toContain('A&B');
    expect(url).toContain(encodeURIComponent('A&B #7?x=1'));
  });
});

describe('payment details visibility', () => {
  it('sends nothing when the owner published neither', () => {
    const contact = toPublicContact(buildProperty());

    expect(contact.paymentDetails).toBeNull();
    // Not merely hidden in the UI — absent from the response.
    expect(JSON.stringify(contact)).not.toContain('1234567890');
    expect(JSON.stringify(contact)).not.toContain('heaven@upi');
  });

  it('sends UPI alone when only UPI is published', () => {
    // The common case: a UPI handle is printed on a counter, an account number
    // is the pair used to spoof a payment request. One switch would force the
    // owner to publish both or neither.
    const contact = toPublicContact(
      buildProperty({
        settings: {
          ...buildProperty().settings,
          showUpiPublicly: true,
        } as PublicPropertyRecord['settings'],
      }),
    );

    expect(contact.paymentDetails?.upi?.upiId).toBe('heaven@upi');
    expect(contact.paymentDetails?.bank).toBeNull();
    expect(JSON.stringify(contact)).not.toContain('1234567890');
    expect(JSON.stringify(contact)).not.toContain('HDFC0001234');
  });

  it('sends bank details alone when only the bank half is published', () => {
    const contact = toPublicContact(
      buildProperty({
        settings: {
          ...buildProperty().settings,
          showBankDetailsPublicly: true,
        } as PublicPropertyRecord['settings'],
      }),
    );

    expect(contact.paymentDetails?.bank?.accountNumber).toBe('1234567890');
    expect(contact.paymentDetails?.upi).toBeNull();
    expect(JSON.stringify(contact)).not.toContain('heaven@upi');
  });
});

describe('room types and availability', () => {
  const roomTypes = groupRoomsIntoTypes(ROOMS);
  const availability = toAvailability(roomTypes);
  const serialised = JSON.stringify({ roomTypes, availability });

  it('exposes exactly the agreed room-type fields and nothing more', () => {
    // An allowlist, not a denylist: a column added to Room later cannot reach
    // the public API without this test failing first.
    for (const roomType of roomTypes) {
      expect(Object.keys(roomType).sort()).toEqual([
        'availableBeds',
        'capacity',
        'description',
        'facilities',
        'isAirConditioned',
        'key',
        'monthlyRentPaise',
        'name',
        'totalBeds',
      ]);
    }
  });

  it('never exposes room numbers, floors or bed identities', () => {
    // Precise availability is a map of where people live.
    for (const key of ['number', 'floorId', 'floor', 'beds', 'label', 'status']) {
      expect(serialised, `"${key}" must not appear in a public payload`).not.toContain(`"${key}"`);
    }
  });

  it('groups identical room types and sums their availability', () => {
    const shared = roomTypes.find((type) => type.name === '3 Sharing');

    // Two rooms of this type: 2 free in the first, 0 offerable in the second.
    expect(shared?.availableBeds).toBe(2);
    expect(roomTypes).toHaveLength(2);
  });

  it('excludes maintenance and blocked beds from the total, not just the free count', () => {
    const shared = roomTypes.find((type) => type.name === '3 Sharing');

    // 3 in the first room + 1 occupied in the second. Counting the blocked and
    // maintenance beds would advertise capacity that cannot be sold.
    expect(shared?.totalBeds).toBe(4);
  });

  it('totals availability across room types', () => {
    expect(availability.availableBeds).toBe(3);
    expect(availability.totalBeds).toBe(5);
  });

  it('advertises the cheapest type that actually has a bed', () => {
    expect(availability.startingRentPaise).toBe(700_000);

    // When the cheapest type is full, quoting its price would bring people in
    // to ask about a room they cannot have.
    const cheapestFull = groupRoomsIntoTypes([
      { ...ROOMS[0], beds: [{ status: 'OCCUPIED' }] } as PublicRoomRecord,
      ROOMS[2] as PublicRoomRecord,
    ]);

    expect(toAvailability(cheapestFull).startingRentPaise).toBe(1_450_000);
  });

  it('reports money as integer paise, never a formatted string', () => {
    for (const roomType of roomTypes) {
      expect(Number.isInteger(roomType.monthlyRentPaise)).toBe(true);
    }
    expect(serialised).not.toContain('₹');
  });

  it('handles a property with no rooms configured', () => {
    const empty = toAvailability(groupRoomsIntoTypes([]));

    expect(empty.availableBeds).toBe(0);
    expect(empty.startingRentPaise).toBeNull();
    expect(empty.byRoomType).toEqual([]);
  });

  it('reports zero availability when every bed is taken', () => {
    const full = groupRoomsIntoTypes([
      {
        roomType: 'Full',
        capacity: 2,
        monthlyRentPaise: 100,
        isAirConditioned: false,
        description: null,
        facilities: [],
        beds: [{ status: 'OCCUPIED' }, { status: 'OCCUPIED' }],
      },
    ] as PublicRoomRecord[]);

    expect(toAvailability(full).availableBeds).toBe(0);
  });
});

describe('menu resolution', () => {
  const source: MenuSource = {
    timings: [
      { mealType: 'BREAKFAST', startsAt: '08:00', endsAt: '09:30' },
      { mealType: 'DINNER', startsAt: '20:00', endsAt: '21:30' },
    ],
    weekly: [
      { dayOfWeek: 7, mealType: 'BREAKFAST', items: ['Dosa'], description: null },
      { dayOfWeek: 7, mealType: 'LUNCH', items: ['Biryani'], description: null },
      { dayOfWeek: 7, mealType: 'DINNER', items: ['Dal', 'Roti'], description: null },
      { dayOfWeek: 1, mealType: 'LUNCH', items: ['Rajma'], description: null },
    ],
    overrides: [],
  };

  it('serves the weekly menu when no override exists', () => {
    const day = resolveDayMenu(source, 7, '2026-08-30');

    expect(day.dayName).toBe('Sunday');
    expect(day.meals.map((meal) => meal.items)).toEqual([['Dosa'], ['Biryani'], ['Dal', 'Roti']]);
    expect(day.meals.every((meal) => !meal.isSpecial)).toBe(true);
  });

  it('lets a dated override replace one meal without disturbing the others', () => {
    // The whole point of a separate override table: a festival dinner must not
    // destroy what "Sunday dinner" normally is.
    const day = resolveDayMenu(
      {
        ...source,
        overrides: [
          { mealType: 'DINNER', items: ['Paneer', 'Puri'], description: 'Festival special' },
        ],
      },
      7,
      '2026-08-30',
    );

    const dinner = day.meals.find((meal) => meal.mealType === 'DINNER');
    expect(dinner?.items).toEqual(['Paneer', 'Puri']);
    expect(dinner?.isSpecial).toBe(true);

    // Breakfast and lunch still come from the weekly menu.
    expect(day.meals.find((meal) => meal.mealType === 'LUNCH')?.items).toEqual(['Biryani']);
    expect(day.meals.find((meal) => meal.mealType === 'LUNCH')?.isSpecial).toBe(false);

    // And the weekly menu itself is untouched.
    expect(resolveDayMenu(source, 7, '2026-09-06').meals.at(-1)?.items).toEqual(['Dal', 'Roti']);
  });

  it('always orders meals breakfast, lunch, dinner', () => {
    // Not whatever order the database returned.
    const day = resolveDayMenu(source, 7, null);
    expect(day.meals.map((meal) => meal.mealType)).toEqual(['BREAKFAST', 'LUNCH', 'DINNER']);
  });

  it('omits a meal with nothing published rather than showing an empty one', () => {
    // "No breakfast listed" and "breakfast: nothing" are different claims.
    const day = resolveDayMenu(source, 1, null);
    expect(day.meals.map((meal) => meal.mealType)).toEqual(['LUNCH']);
  });

  it('attaches the serving time to each meal, and null when none is configured', () => {
    const day = resolveDayMenu(source, 7, null);

    expect(day.meals.find((meal) => meal.mealType === 'BREAKFAST')?.timing).toEqual({
      mealType: 'BREAKFAST',
      startsAt: '08:00',
      endsAt: '09:30',
    });
    expect(day.meals.find((meal) => meal.mealType === 'LUNCH')?.timing).toBeNull();
  });

  it('orders timings by meal, not by insertion', () => {
    expect(toMealTimings(source.timings).map((timing) => timing.mealType)).toEqual([
      'BREAKFAST',
      'DINNER',
    ]);
  });
});

describe('facility icons', () => {
  it('passes through a known key', () => {
    expect(toPublicFacility({ name: 'Wi-Fi', description: null, iconKey: 'wifi' }).iconKey).toBe(
      'wifi',
    );
  });

  it('drops an unknown key rather than forwarding it to the client', () => {
    // The client maps keys to glyphs from a fixed table. Forwarding an arbitrary
    // backend-supplied symbol name is how a database row starts deciding what
    // the app renders.
    expect(
      toPublicFacility({ name: 'Something', description: null, iconKey: 'rm -rf' }).iconKey,
    ).toBeNull();
    expect(toPublicFacility({ name: 'Plain', description: null, iconKey: null }).iconKey).toBeNull();
  });
});
