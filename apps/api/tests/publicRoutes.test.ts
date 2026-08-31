import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The public API through the real HTTP stack.
 *
 * public.test.ts covers the mappers in isolation; this covers what actually
 * leaves the process — routing, validation, the response envelope, and the
 * guarantee that no endpoint here needs (or accepts) a token.
 *
 * Prisma is stubbed rather than faked: these tests are about the HTTP surface,
 * and the queries themselves are `select`-pinned in the repository, which is
 * where the private/public boundary is actually enforced.
 */

const PROPERTY = {
  id: 'property-1',
  name: 'Heaven Hospitality',
  tagline: 'A calmer place to live',
  description: 'A managed residence.',
  heroImageUrl: 'https://cdn.example/hero.jpg',
  highlights: ['Meals included'],
  checkInInfo: 'Visit between 9 and 8.',
  timezone: 'Asia/Kolkata',
  addressLine: 'Plot 14',
  locality: 'Kothrud',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411038',
  latitude: { toString: () => '18.507600' },
  longitude: { toString: () => '73.807600' },
  contactPhone: '+919876543210',
  whatsappPhone: '+919876543210',
  contactEmail: 'stay@example.in',
  settings: {
    showBankDetailsPublicly: false,
    showUpiPublicly: true,
    bankAccountName: 'Heaven Hospitality',
    bankAccountNumber: '000011112222',
    bankIfsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    upiId: 'heaven@okhdfcbank',
    upiQrImageUrl: null,
  },
};

const ROOMS = [
  {
    roomType: '3 Sharing',
    capacity: 3,
    monthlyRentPaise: 700_000,
    isAirConditioned: false,
    description: 'Popular',
    facilities: ['Fan', 'Desk'],
    beds: [{ status: 'AVAILABLE' }, { status: 'OCCUPIED' }, { status: 'AVAILABLE' }],
  },
];

/** Captures the arguments each endpoint queries with, so filters can be asserted. */
const calls: Record<string, unknown[]> = {};

function record(name: string, args: unknown) {
  (calls[name] ??= []).push(args);
}

const prismaStub = {
  property: {
    findFirst: vi.fn((args: { select?: Record<string, unknown> }) => {
      record('property.findFirst', args);
      // `findPublicPropertyId` and `findPropertyTimezone` ask for narrow shapes;
      // returning the whole record for all of them is harmless here because the
      // route only reads what its mapper asks for.
      return Promise.resolve(PROPERTY);
    }),
  },
  room: {
    findMany: vi.fn((args: unknown) => {
      record('room.findMany', args);
      return Promise.resolve(ROOMS);
    }),
  },
  mealTiming: {
    findMany: vi.fn(() =>
      Promise.resolve([{ mealType: 'BREAKFAST', startsAt: '08:00', endsAt: '09:30' }]),
    ),
  },
  weeklyMenuItem: {
    findMany: vi.fn((args: unknown) => {
      record('weeklyMenuItem.findMany', args);
      return Promise.resolve([
        { dayOfWeek: 1, mealType: 'BREAKFAST', items: ['Poha'], description: null },
        { dayOfWeek: 2, mealType: 'BREAKFAST', items: ['Upma'], description: null },
        { dayOfWeek: 3, mealType: 'BREAKFAST', items: ['Idli'], description: null },
        { dayOfWeek: 4, mealType: 'BREAKFAST', items: ['Paratha'], description: null },
        { dayOfWeek: 5, mealType: 'BREAKFAST', items: ['Sheera'], description: null },
        { dayOfWeek: 6, mealType: 'BREAKFAST', items: ['Misal'], description: null },
        { dayOfWeek: 7, mealType: 'BREAKFAST', items: ['Dosa'], description: null },
      ]);
    }),
  },
  menuOverride: { findMany: vi.fn(() => Promise.resolve([])) },
  facility: {
    findMany: vi.fn((args: unknown) => {
      record('facility.findMany', args);
      return Promise.resolve([{ name: 'Wi-Fi', description: 'Fibre', iconKey: 'wifi' }]);
    }),
    count: vi.fn(() => Promise.resolve(1)),
  },
  propertyPhoto: {
    findMany: vi.fn((args: unknown) => {
      record('propertyPhoto.findMany', args);
      return Promise.resolve([{ url: 'https://cdn.example/1.jpg', caption: 'Lobby' }]);
    }),
    count: vi.fn(() => Promise.resolve(30)),
  },
  propertyRule: {
    findMany: vi.fn((args: unknown) => {
      record('propertyRule.findMany', args);
      return Promise.resolve([{ title: 'No smoking', description: 'Anywhere on the premises.' }]);
    }),
  },
};

vi.mock('../src/lib/prisma.js', () => ({ prisma: prismaStub }));

const { createApp } = await import('../src/app.js');
const { clearPublicCache } = await import('../src/modules/public/public.service.js');

const app: Express = createApp();
const get = (path: string) => request(app).get(`/api/v1/public${path}`);

beforeEach(() => {
  // The service caches for 30 seconds; without this, the second test in a file
  // would assert against the first test's response.
  clearPublicCache();
  for (const key of Object.keys(calls)) delete calls[key];
});

describe('public endpoints are open', () => {
  const paths = [
    '/home',
    '/property',
    '/contact',
    '/location',
    '/rooms',
    '/availability',
    '/menu/today',
    '/menu/week',
    '/facilities',
    '/gallery',
    '/rules',
  ];

  it.each(paths)('serves %s with no Authorization header', async (path) => {
    // The point of the whole phase: someone deciding whether to live here must
    // not have to hand over a phone number first.
    const response = await get(path);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });
});

describe('what the public payload must never contain', () => {
  it.each(['/home', '/rooms', '/availability', '/contact', '/property'])(
    'leaks no resident, bed or internal identifier from %s',
    async (path) => {
      const body = JSON.stringify((await get(path)).body);

      for (const forbidden of [
        '"id"',
        '"propertyId"',
        '"userId"',
        '"tenancyId"',
        '"bedId"',
        '"roomId"',
        '"phoneVerifiedAt"',
        '"passwordHash"',
        '"storageKey"',
      ]) {
        expect(body, `${forbidden} must not appear in ${path}`).not.toContain(forbidden);
      }
    },
  );

  it('omits bank details the owner has not published, but keeps the published UPI id', async () => {
    const response = await get('/contact');

    expect(response.body.data.paymentDetails.upi.upiId).toBe('heaven@okhdfcbank');
    expect(response.body.data.paymentDetails.bank).toBeNull();
    // Not hidden client-side — never sent.
    expect(JSON.stringify(response.body)).not.toContain('000011112222');
    expect(JSON.stringify(response.body)).not.toContain('HDFC0001234');
  });
});

describe('only active, published records are queried', () => {
  it('filters facilities, rules and photos in the WHERE clause', async () => {
    await get('/facilities');
    await get('/rules');
    await get('/gallery');

    // Asserted on the query rather than the response: a record that is never
    // loaded cannot leak through a mapper that forgot to check.
    expect(calls['facility.findMany']?.[0]).toMatchObject({ where: { isActive: true } });
    expect(calls['propertyRule.findMany']?.[0]).toMatchObject({ where: { isActive: true } });
    expect(calls['propertyPhoto.findMany']?.[0]).toMatchObject({ where: { isActive: true } });
  });

  it('counts beds only in rooms that are in service', async () => {
    await get('/rooms');
    expect(calls['room.findMany']?.[0]).toMatchObject({ where: { status: 'ACTIVE' } });
  });

  it('never selects the object-storage key for a gallery image', async () => {
    await get('/gallery');

    const select = (calls['propertyPhoto.findMany']?.[0] as { select: Record<string, unknown> })
      .select;
    expect(select).not.toHaveProperty('storageKey');
  });
});

describe('query validation', () => {
  it('rejects a page size beyond the cap instead of honouring it', async () => {
    // An unauthenticated endpoint that accepts an unbounded page is one seeded
    // bulk upload away from being a denial-of-service lever.
    const response = await get('/gallery?pageSize=5000');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('applies sensible defaults when no pagination is given', async () => {
    const response = await get('/gallery');

    expect(response.body.data).toMatchObject({ page: 1, pageSize: 24, total: 30, hasMore: true });
  });

  it('rejects a malformed menu date', async () => {
    const response = await get('/menu/today?date=not-a-date');
    expect(response.status).toBe(400);
  });

  it('refuses a menu date outside the published window', async () => {
    const response = await get('/menu/today?date=2000-01-01');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('menu shape', () => {
  it("returns today's meals with their serving times", async () => {
    const response = await get('/menu/today');

    expect(response.body.data.meals[0]).toMatchObject({
      mealType: 'BREAKFAST',
      timing: { startsAt: '08:00', endsAt: '09:30' },
      isSpecial: false,
    });
  });

  it('returns seven dated days, starting from today', async () => {
    const response = await get('/menu/week');

    expect(response.body.data.days).toHaveLength(7);
    expect(response.body.data.days[0].dayOfWeek).toBe(response.body.data.todayDayOfWeek);
    for (const day of response.body.data.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('the home screen', () => {
  it('carries everything the landing page renders in one request', async () => {
    const response = await get('/home');

    expect(response.body.data).toMatchObject({
      property: { name: 'Heaven Hospitality' },
      availability: { availableBeds: 2, startingRentPaise: 700_000 },
      facilityCount: 1,
      galleryCount: 30,
    });
    expect(response.body.data.todayMenu.meals.length).toBeGreaterThan(0);
    expect(response.body.data.roomTypePreview).toHaveLength(1);
  });
});
