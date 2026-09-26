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
const { setWhatsappProviderForTesting } = await import(
  '../src/modules/notifications/providers/whatsapp.provider.js'
);
const { EVENTS } = await import('../src/modules/notifications/events.js');
const { sendDltSms, sendWhatsappTemplate, toFast2smsNumber } = await import(
  '../src/modules/notifications/providers/fast2sms.client.js'
);

const whatsappSent: Array<{ template: string; variables: readonly string[] }> = [];

beforeEach(() => {
  deliveries.length = 0;
  tokens.length = 0;
  whatsappSent.length = 0;
  users.clear();
  users.set('u1', { phone: '+919876543210', status: 'ACTIVE', mutedNotificationKinds: [] });
  tokens.push({ id: 't1', userId: 'u1', token: 'ExponentPushToken[abcdefghij]', disabledAt: null });
  setPushProviderForTesting({
    name: 'fake-push',
    send: (messages) =>
      Promise.resolve(messages.map(() => ({ ok: true, ticketId: 'tk1', error: null }))),
    getReceipts: () => Promise.resolve(new Map()),
  });
  setWhatsappProviderForTesting({
    name: 'fake-wa',
    send: (params) => {
      whatsappSent.push({ template: params.template, variables: params.variables });
      return Promise.resolve('wa1');
    },
  });
});

const rent = { name: 'Rahul', month: 'September 2026', amountPaise: 750_000, dueDate: '2026-09-05' };
const payment = { amountPaise: 100, receiptNumber: 'R1' };

describe('channel selection', () => {
  it('sends the due-soon reminder by push only', async () => {
    await notify({ event: 'RENT_DUE_SOON', userId: 'u1', dedupeKey: 'a', params: rent });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
    expect(whatsappSent).toHaveLength(0);
  });

  it('sends the due-today reminder by push and WhatsApp', async () => {
    await notify({ event: 'RENT_DUE_TODAY', userId: 'u1', dedupeKey: 'a', params: rent });
    expect(deliveries.map((d) => d.channel).sort()).toEqual(['PUSH', 'WHATSAPP']);
    expect(whatsappSent[0]?.template).toBe('RENT_DUE');
  });

  it('can narrow an overdue reminder to push only', async () => {
    await notify({
      event: 'RENT_OVERDUE',
      userId: 'u1',
      dedupeKey: 'a',
      channels: ['PUSH'],
      params: { name: 'Rahul', month: 'September 2026', amountPaise: 750_000, daysOverdue: 1 },
    });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
  });

  it('sends payment confirmation by push only', async () => {
    await notify({ event: 'PAYMENT_RECEIVED', userId: 'u1', dedupeKey: 'p', params: payment });
    expect(deliveries.map((d) => d.channel)).toEqual(['PUSH']);
  });

  it('builds the WhatsApp variables in template order', () => {
    const spec = EVENTS.RENT_DUE_TODAY.whatsapp?.(rent);
    expect(spec?.variables).toHaveLength(4);
    expect(spec?.variables[0]).toBe('Rahul');
    expect(spec?.variables[1]).toBe('September 2026');
    expect(spec?.variables[3]).toBe('2026-09-05');
  });
});

describe('duplicate prevention', () => {
  it('does not send the same logical message twice', async () => {
    const input = { event: 'RENT_DUE_TODAY', userId: 'u1', dedupeKey: 'inv1', params: rent } as const;
    await notify(input);
    await notify(input);
    expect(deliveries).toHaveLength(2);
    expect(whatsappSent).toHaveLength(1);
  });
});

describe('failure handling', () => {
  it('never throws when the provider fails, and records the failure', async () => {
    setWhatsappProviderForTesting({ name: 'down', send: () => Promise.reject(new Error('boom')) });
    await expect(
      notify({ event: 'RENT_DUE_TODAY', userId: 'u1', dedupeKey: 'a', params: rent }),
    ).resolves.toBeUndefined();
    expect(deliveries.find((d) => d.channel === 'WHATSAPP')?.status).toBe('FAILED');
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

describe('Fast2SMS client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

  it('converts E.164 to the bare 10-digit number', () => {
    expect(toFast2smsNumber('+919876543210')).toBe('9876543210');
  });

  it('builds the DLT SMS request with the key in a header, not the URL', async () => {
    fetchMock.mockResolvedValue(ok({ return: true, request_id: 'r1' }));
    const id = await sendDltSms({
      phone: '+919876543210',
      senderId: 'TESTHH',
      templateId: '111111',
      variables: ['123456'],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(id).toBe('r1');
    expect(url).toContain('/dev/bulkV2');
    expect(url).toContain('route=dlt');
    expect(url).toContain('numbers=9876543210');
    expect(url).toContain('variables_values=123456');
    expect(url).not.toContain('test-key');
    expect(init.headers['authorization']).toBe('test-key');
  });

  it('keeps a pipe inside a value from splitting the variables', async () => {
    fetchMock.mockResolvedValue(ok({ status: true, request_id: 'r2' }));
    await sendWhatsappTemplate({
      phone: '+919876543210',
      phoneNumberId: '999',
      messageId: '11',
      variables: ['A|B', 'C'],
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get('variables_values')).toBe('A B|C');
  });

  it('rejects, without leaking the key, when Fast2SMS refuses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ return: false, message: ['Invalid template'] }),
    });
    const error = await sendDltSms({
      phone: '+919876543210',
      senderId: 'X',
      templateId: '1',
      variables: ['1'],
    }).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/Invalid template/);
    expect((error as Error).message).not.toMatch(/test-key/);
  });

  it('rejects when the provider is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(
      sendDltSms({ phone: '+919876543210', senderId: 'X', templateId: '1', variables: ['1'] }),
    ).rejects.toThrow(/unreachable/);
  });
});
