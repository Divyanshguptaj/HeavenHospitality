import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({ prisma: { user: { findMany } } }));
vi.mock('../src/modules/property/property.context.js', () => ({
  getPropertyContext: () => Promise.resolve({ propertyId: 'property-1' }),
}));

const { searchResidentCandidates } = await import('../src/modules/residents/residents.service.js');
type Actor = Parameters<typeof searchResidentCandidates>[0];

const actor = { userId: 'admin-1' } as Actor;

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    fullName: 'Divyansh Gupta',
    email: null,
    phone: '+919369846995',
    tenancies: [],
    ...overrides,
  };
}

function lastWhere(): Record<string, unknown> {
  const args = findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
  return args.where;
}

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe('searching for a resident to add', () => {
  it('matches a name by every word, in any order, ignoring case', async () => {
    await searchResidentCandidates(actor, '  gupta  DIVY ');

    expect(lastWhere()['AND']).toEqual([
      { fullName: { contains: 'gupta', mode: 'insensitive' } },
      { fullName: { contains: 'DIVY', mode: 'insensitive' } },
    ]);
    expect(lastWhere()['phone']).toBeUndefined();
  });

  it('matches digits against any part of the phone number', async () => {
    await searchResidentCandidates(actor, '98 7654');

    expect(lastWhere()['phone']).toEqual({ contains: '987654' });
    expect(lastWhere()['AND']).toBeUndefined();
  });

  it('ignores the +91 formatting a person might type', async () => {
    await searchResidentCandidates(actor, '+91 93698');

    expect(lastWhere()['phone']).toEqual({ contains: '9193698' });
  });

  it('searches by name when there are too few digits to be a phone number', async () => {
    await searchResidentCandidates(actor, 'a1');

    expect(lastWhere()['phone']).toBeUndefined();
    expect(lastWhere()['AND']).toBeDefined();
  });

  it('never offers owners or suspended accounts', async () => {
    await searchResidentCandidates(actor, 'rahul');

    expect(lastWhere()['role']).toEqual({ not: 'ADMIN' });
    expect(lastWhere()['status']).toBe('ACTIVE');
  });

  it('caps the list at 20, in name order', async () => {
    await searchResidentCandidates(actor, 'rahul');

    const args = findMany.mock.calls.at(-1)?.[0] as { take: number; orderBy: unknown };
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual({ fullName: 'asc' });
  });

  it('only counts word matches up to a sensible limit', async () => {
    await searchResidentCandidates(actor, 'a b c d e f g h');

    expect((lastWhere()['AND'] as unknown[]).length).toBe(4);
  });

  it('tells apart a stranger, a resident awaiting a bed and a resident with a bed', async () => {
    findMany.mockResolvedValue([
      userRow({ id: 'stranger' }),
      userRow({ id: 'waiting', tenancies: [{ id: 't1', allocations: [] }] }),
      userRow({ id: 'housed', tenancies: [{ id: 't2', allocations: [{ id: 'a1' }] }] }),
    ]);

    const result = await searchResidentCandidates(actor, 'gupta');

    expect(result.map((r) => [r.id, r.activeTenancyId, r.hasBed])).toEqual([
      ['stranger', null, false],
      ['waiting', 't1', false],
      ['housed', 't2', true],
    ]);
  });

  it('returns the name and contact needed to pick the right person', async () => {
    findMany.mockResolvedValue([userRow({ email: 'd@example.com' })]);

    const [person] = await searchResidentCandidates(actor, 'divy');

    expect(person).toMatchObject({
      fullName: 'Divyansh Gupta',
      phone: '+919369846995',
      email: 'd@example.com',
    });
  });

  it('scopes the stay lookup to the owner’s own property', async () => {
    await searchResidentCandidates(actor, 'rahul');

    const args = findMany.mock.calls.at(-1)?.[0] as {
      select: { tenancies: { where: { propertyId: string } } };
    };
    expect(args.select.tenancies.where.propertyId).toBe('property-1');
  });
});
