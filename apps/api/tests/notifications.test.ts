import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Delivery {
  id: string;
  userId: string;
  event: string;
  channel: string;
  status: string;
  dedupeKey: string;
  providerMessageId: string | null;
  lastError: string | null;
}

const deliveries: Delivery[] = [];
const tokens: Array<{ id: string; userId: string; token: string; disabledAt: Date | null }> = [];
const users = new Map<string, { phone: string; status: string; mutedNotificationKinds: string[] }>();

class UniqueViolation extends Error {
  code = 'P2002';
}

const fakePrisma = {
  user: {
    findUnique: ({ where }: { where: { id: string } }) => Promise.resolve(users.get(where.id) ?? null),
  },
  deviceToken: {
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(tokens.filter((t) => t.userId === where.userId && t.disabledAt === null)),
    updateMany: ({ where }: { where: { id: { in: string[] } } }) => {
      for (const t of tokens) if (where.id.in.includes(t.id)) t.disabledAt = new Date();
      return Promise.resolve({ count: 1 });
    },
  },
  notificationDelivery: {
    create: ({
      data,
    }: {
      data: Omit<Delivery, 'id' | 'status' | 'providerMessageId' | 'lastError'>;
    }) => {
      if (deliveries.some((d) => d.dedupeKey === data.dedupeKey && d.channel === data.channel)) {
        return Promise.reject(new UniqueViolation());
      }
      const row: Delivery = {
        ...data,
        id: `d${deliveries.length}`,
        status: 'PENDING',
        providerMessageId: null,
        lastError: null,
      };
      deliveries.push(row);
      return Promise.resolve({ id: row.id });
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<Delivery> }) => {
      Object.assign(deliveries.find((d) => d.id === where.id) ?? {}, data);
      return Promise.resolve({});
    },
  },
};

vi.mock('../src/lib/prisma.js', () => ({ prisma: fakePrisma }));
// `instanceof` needs the same class the fake throws.
vi.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: UniqueViolation },
}));

const { notify } = await import('../src/modules/notifications/notification.service.js');
const { setPushProviderForTesting } = await import(
  '../src/modules/notifications/providers/push.provider.js'
);

beforeEach(() => {
  deliveries.length = 0;
  tokens.length = 0;
  users.clear();
  users.set('u1', { phone: '+919876543210', status: 'ACTIVE', mutedNotificationKinds: [] });
  tokens.push({ id: 't1', userId: 'u1', token: 'ExponentPushToken[abcdefghij]', disabledAt: null });
  setPushProviderForTesting({
    name: 'fake-push',
    send: (messages) =>
      Promise.resolve(messages.map(() => ({ ok: true, ticketId: 'tk1', error: null }))),
    getReceipts: () => Promise.resolve(new Map()),
  });
});

const rent = { name: 'Rahul', month: 'September 2026', amountPaise: 750_000, dueDate: '2026-09-05' };
const payment = { amountPaise: 100, receiptNumber: 'R1' };

describe('channel selection', () => {
  it('sends the due-soon reminder by push only', async () => {
    await notify({ event: 'RENT_DUE_SOON', userId: 'u1', dedupeKey: 'a', params: rent });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
  });

  it('sends the due-today reminder by push only', async () => {
    await notify({ event: 'RENT_DUE_TODAY', userId: 'u1', dedupeKey: 'a', params: rent });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
  });

  it('sends the overdue reminder by push only', async () => {
    await notify({
      event: 'RENT_OVERDUE',
      userId: 'u1',
      dedupeKey: 'a',
      params: { name: 'Rahul', month: 'September 2026', amountPaise: 750_000, daysOverdue: 1 },
    });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
  });

  it('sends payment confirmation by push only', async () => {
    await notify({ event: 'PAYMENT_RECEIVED', userId: 'u1', dedupeKey: 'p', params: payment });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
  });
});

describe('duplicate prevention', () => {
  it('does not send the same logical message twice', async () => {
    const input = { event: 'RENT_DUE_TODAY', userId: 'u1', dedupeKey: 'inv1', params: rent } as const;
    await notify(input);
    await notify(input);
    expect(deliveries).toHaveLength(1);
  });
});

describe('failure handling', () => {
  it('never throws when the provider fails, and records the failure', async () => {
    setPushProviderForTesting({
      name: 'down',
      send: () => Promise.reject(new Error('boom')),
      getReceipts: () => Promise.resolve(new Map()),
    });
    await expect(
      notify({ event: 'RENT_DUE_TODAY', userId: 'u1', dedupeKey: 'a', params: rent }),
    ).resolves.toBeUndefined();
    expect(deliveries.find((d) => d.channel === 'PUSH')?.status).toBe('FAILED');
  });

  it('disables a device token Expo reports as unregistered', async () => {
    setPushProviderForTesting({
      name: 'fake-push',
      send: () => Promise.resolve([{ ok: false, ticketId: null, error: 'DeviceNotRegistered' }]),
      getReceipts: () => Promise.resolve(new Map()),
    });
    await notify({ event: 'PAYMENT_RECEIVED', userId: 'u1', dedupeKey: 'p1', params: payment });
    expect(tokens[0]?.disabledAt).not.toBeNull();
    expect(deliveries[0]?.status).toBe('FAILED');
  });

  it('skips push, without failing, when the user has no device', async () => {
    tokens.length = 0;
    await notify({ event: 'PAYMENT_RECEIVED', userId: 'u1', dedupeKey: 'p1', params: payment });
    expect(deliveries[0]?.status).toBe('SKIPPED');
  });
});

describe('preferences', () => {
  it('honours a muted optional category', async () => {
    users.set('u1', {
      phone: '+919876543210',
      status: 'ACTIVE',
      mutedNotificationKinds: ['COMPLAINTS'],
    });
    await notify({
      event: 'COMPLAINT_STATUS_CHANGED',
      userId: 'u1',
      dedupeKey: 'c',
      params: { title: 'Fan', statusLabel: 'resolved' },
    });
    expect(deliveries).toHaveLength(0);
  });

  it('ignores a mute on a mandatory category', async () => {
    users.set('u1', {
      phone: '+919876543210',
      status: 'ACTIVE',
      mutedNotificationKinds: ['FINANCIAL'],
    });
    await notify({ event: 'PAYMENT_RECEIVED', userId: 'u1', dedupeKey: 'p', params: payment });
    expect(deliveries).toHaveLength(1);
  });
});
