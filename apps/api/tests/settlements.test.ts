import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const holder = vi.hoisted(() => ({
  prisma: {} as Record<string, unknown>,
  notify: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({ prisma: holder.prisma }));
vi.mock('../src/modules/notifications/notification.service.js', () => ({
  notify: holder.notify,
}));
vi.mock('../src/modules/property/property.context.js', () => ({
  getPropertyContext: () =>
    Promise.resolve({
      propertyId: 'p1',
      timezone: 'Asia/Kolkata',
      settings: {
        rentDueDay: 1,
        graceDays: 0,
        lateFeePerDayPaise: 10_000,
        lateFeeCapPaise: 300_000,
      },
    }),
}));

const { settleBalance, planSettlement } = await import(
  '../src/modules/settlements/settlements.service.js'
);
const { recomputeInvoice } = await import('../src/modules/billing/invoice.service.js');
type Actor = Parameters<typeof settleBalance>[0];
type Tx = Parameters<typeof recomputeInvoice>[0];

const actor = { userId: 'admin-1' } as Actor;
const settings = {
  rentDueDay: 1,
  graceDays: 0,
  lateFeePerDayPaise: 10_000,
  lateFeeCapPaise: 300_000,
} as never;

interface Item {
  id: string;
  kind: string;
  description: string;
  amountPaise: number;
  sourceType?: string;
  sourceId?: string;
}

interface Bill {
  id: string;
  number: string;
  category: 'RENT' | 'ELECTRICITY' | 'DEPOSIT';
  status: string;
  periodKey: string;
  tenancyId: string;
  propertyId: string;
  dueDate: Date;
  amountPaidPaise: number;
  totalPaise: number;
  lateFeeWaivedAt: Date | null;
  lateFeeForgivenPaise: number;
  settledOn: Date | null;
  paidOn: Date | null;
  items: Item[];
}

const day = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

function world() {
  let itemSeq = 0;
  const bills = new Map<string, Bill>();
  const settlements: Row[] = [];
  const audits: Row[] = [];
  const state = { sequence: 0, deposit: 1_150_000, paymentsCreated: 0 };

  const addBill = (bill: Partial<Bill> & Pick<Bill, 'id' | 'category'>, items: Array<[string, number]>) => {
    const full: Bill = {
      number: `INV-${bill.id}`,
      status: 'ISSUED',
      periodKey: '2026-11',
      tenancyId: 't1',
      propertyId: 'p1',
      dueDate: day(2026, 11, 1),
      amountPaidPaise: 0,
      totalPaise: 0,
      lateFeeWaivedAt: null,
      lateFeeForgivenPaise: 0,
      settledOn: null,
      paidOn: null,
      items: items.map(([kind, amountPaise]) => ({
        id: `it${(itemSeq += 1)}`,
        kind,
        description: kind,
        amountPaise,
      })),
      ...bill,
    };
    full.totalPaise = full.items.reduce((sum, item) => sum + item.amountPaise, 0);
    bills.set(full.id, full);
    return full;
  };

  const copy = (bill: Bill): Bill => ({ ...bill, items: bill.items.map((item) => ({ ...item })) });

  const tx = {
    $queryRaw: (strings: TemplateStringsArray) => {
      if (strings.join('').includes('SettlementSequence')) {
        return Promise.resolve([{ lastNumber: state.sequence }]);
      }
      return Promise.resolve([]);
    },
    invoice: {
      findMany: ({ where }: { where: { id: { in: string[] }; tenancyId: string } }) =>
        Promise.resolve(
          [...bills.values()]
            .filter((bill) => where.id.in.includes(bill.id) && bill.tenancyId === where.tenancyId)
            .map(copy),
        ),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) =>
        Promise.resolve(copy(bills.get(where.id) as Bill)),
      update: ({ where, data }: { where: { id: string }; data: Row }) => {
        const bill = bills.get(where.id) as Bill;
        for (const [key, value] of Object.entries(data)) {
          if (key === 'lateFeeForgivenPaise' && typeof value === 'object' && value !== null) {
            bill.lateFeeForgivenPaise += (value as { increment: number }).increment;
          } else {
            (bill as unknown as Row)[key] = value;
          }
        }
        return Promise.resolve();
      },
    },
    invoiceItem: {
      create: ({ data }: { data: Item & { invoiceId: string } }) => {
        (bills.get(data.invoiceId) as Bill).items.push({ ...data, id: `it${(itemSeq += 1)}` });
        return Promise.resolve();
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<Item> }) => {
        for (const bill of bills.values()) {
          const item = bill.items.find((entry) => entry.id === where.id);
          if (item !== undefined) Object.assign(item, data);
        }
        return Promise.resolve();
      },
      delete: ({ where }: { where: { id: string } }) => {
        for (const bill of bills.values()) bill.items = bill.items.filter((i) => i.id !== where.id);
        return Promise.resolve();
      },
    },
    paymentAllocation: {
      findFirst: ({ where }: { where: { invoiceId: string } }) => {
        const paidOn = (bills.get(where.invoiceId) as Bill).paidOn;
        return Promise.resolve(paidOn === null ? null : { payment: { paidAt: paidOn } });
      },
    },
    payment: {
      create: () => {
        state.paymentsCreated += 1;
        return Promise.reject(new Error('a settlement must never create a payment'));
      },
    },
    settlementSequence: {
      upsert: () => Promise.resolve(),
      update: ({ data }: { data: { lastNumber: number } }) => {
        state.sequence = data.lastNumber;
        return Promise.resolve();
      },
    },
    settlement: {
      create: ({ data }: { data: Row }) => {
        const row = { ...data, id: `s${settlements.length + 1}`, createdAt: new Date() };
        settlements.push(row);
        return Promise.resolve(row);
      },
      findUnique: ({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(settlements.find((row) => row['idempotencyKey'] === where.idempotencyKey) ?? null),
    },
    tenancy: {
      findFirst: () => Promise.resolve({ id: 't1' }),
      findUniqueOrThrow: () =>
        Promise.resolve({
          id: 't1',
          userId: 'resident-1',
          securityDepositPaise: state.deposit,
          user: { fullName: 'Divyansh Gupta' },
          property: { name: 'Heaven Hospitality' },
          allocations: [{ bed: { room: { number: '104' } } }],
        }),
      update: ({ data }: { data: { securityDepositPaise: number } }) => {
        state.deposit = data.securityDepositPaise;
        return Promise.resolve();
      },
    },
    auditLog: {
      create: ({ data }: { data: Row }) => {
        audits.push(data);
        return Promise.resolve();
      },
    },
  };

  const prismaMock: Record<string, unknown> = {
    tenancy: tx.tenancy,
    settlement: tx.settlement,
    $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };

  return { tx: tx as unknown as Tx, prismaMock, bills, settlements, audits, state, addBill };
}

let w: ReturnType<typeof world>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:00:00Z')); // 5 November, late morning in India
  holder.notify.mockReset();
  w = world();
  for (const key of Object.keys(holder.prisma)) delete holder.prisma[key];
  Object.assign(holder.prisma, w.prismaMock);
});

afterEach(() => {
  vi.useRealTimers();
});

/** A November rent bill, due 1 Nov, carrying the Rs 400 late fee it has earned by 5 Nov. */
const rentBill = () =>
  w.addBill({ id: 'rent', category: 'RENT', status: 'OVERDUE' }, [
    ['RENT', 900_000],
    ['LATE_FEE', 40_000],
  ]);

const settle = (lines: Array<{ invoiceId: string; amountPaise: number; lateFeePaise?: number }>, extra = {}) =>
  settleBalance(actor, 't1', {
    lines: lines.map((line) => ({ lateFeePaise: 0, ...line })),
    note: 'Fixed the geyser',
    ...extra,
  });

const bill = (id: string): Bill => w.bills.get(id) as Bill;
const lateFeeOf = (id: string): number =>
  bill(id).items.filter((i) => i.kind === 'LATE_FEE').reduce((s, i) => s + i.amountPaise, 0);

describe('settling a rent bill and its late fee', () => {
  it('forgives the whole bill, late fee included, with nothing paid or collected', async () => {
    rentBill();

    const receipt = await settle([{ invoiceId: 'rent', amountPaise: 900_000, lateFeePaise: 40_000 }]);

    expect(bill('rent').totalPaise).toBe(0);
    expect(bill('rent').status).toBe('PAID');
    expect(bill('rent').amountPaidPaise).toBe(0); // never counted as collected
    expect(w.state.paymentsCreated).toBe(0);
    expect(receipt.settledPaise).toBe(900_000);
    expect(receipt.lateFeeForgivenPaise).toBe(40_000);
    expect(receipt.totalPaise).toBe(940_000);
  });

  it('leaves the late fee owed, and frozen, when only the rent is settled', async () => {
    rentBill();

    await settle([{ invoiceId: 'rent', amountPaise: 900_000 }]);

    // The fee is still owed, held at what it had grown to on the day of settling.
    expect(lateFeeOf('rent')).toBe(40_000);
    expect(bill('rent').totalPaise).toBe(40_000);
    expect(bill('rent').status).not.toBe('PAID');

    // And it does not keep growing on later nights.
    vi.setSystemTime(new Date('2026-11-20T06:00:00Z'));
    await recomputeInvoice(w.tx, 'rent', settings, '2026-11-20');
    expect(lateFeeOf('rent')).toBe(40_000);
  });

  it('keeps charging the late fee on rent that is only partly settled', async () => {
    rentBill();

    await settle([{ invoiceId: 'rent', amountPaise: 500_000 }]);

    expect(bill('rent').totalPaise).toBe(900_000 - 500_000 + 40_000);

    vi.setSystemTime(new Date('2026-11-08T06:00:00Z'));
    await recomputeInvoice(w.tx, 'rent', settings, '2026-11-08');
    expect(lateFeeOf('rent')).toBe(70_000); // 7 days at Rs 100
  });

  it('forgives part of the late fee and keeps that part forgiven as the fee grows', async () => {
    rentBill();

    await settle([{ invoiceId: 'rent', amountPaise: 0, lateFeePaise: 30_000 }]);

    expect(lateFeeOf('rent')).toBe(10_000);

    vi.setSystemTime(new Date('2026-11-08T06:00:00Z'));
    await recomputeInvoice(w.tx, 'rent', settings, '2026-11-08');
    expect(lateFeeOf('rent')).toBe(40_000); // 700 earned, 300 forgiven
  });

  it('settles what is left after part of the rent was paid, and the paid part stays collected', async () => {
    const paid = rentBill();
    paid.amountPaidPaise = 300_000;
    paid.paidOn = day(2026, 11, 3);
    paid.status = 'PARTIALLY_PAID';

    await settle([{ invoiceId: 'rent', amountPaise: 600_000, lateFeePaise: 40_000 }]);

    expect(bill('rent').amountPaidPaise).toBe(300_000);
    expect(bill('rent').totalPaise).toBe(300_000);
    expect(bill('rent').status).toBe('PAID');
  });
});

describe('what is allowed', () => {
  it('refuses to settle more than the bill still owes', async () => {
    rentBill();

    await expect(settle([{ invoiceId: 'rent', amountPaise: 900_001 }])).rejects.toThrow(/most you can settle/);
  });

  it('refuses to settle more than what was left after a payment', async () => {
    const paid = rentBill();
    paid.amountPaidPaise = 300_000;

    await expect(settle([{ invoiceId: 'rent', amountPaise: 700_000 }])).rejects.toThrow(/most you can settle/);
  });

  it('refuses to forgive more late fee than the bill carries', async () => {
    rentBill();

    await expect(
      settle([{ invoiceId: 'rent', amountPaise: 0, lateFeePaise: 40_001 }]),
    ).rejects.toThrow(/late fee is/);
  });

  it('refuses a late fee on electricity, which never carries one', async () => {
    w.addBill({ id: 'elec', category: 'ELECTRICITY' }, [['ELECTRICITY', 25_000]]);

    await expect(
      settle([{ invoiceId: 'elec', amountPaise: 0, lateFeePaise: 100 }]),
    ).rejects.toThrow(/only rent carries a late fee/);
  });

  it('refuses a bill that is already paid or cancelled', async () => {
    w.addBill({ id: 'paid', category: 'RENT', status: 'PAID' }, [['RENT', 900_000]]);
    w.addBill({ id: 'gone', category: 'RENT', status: 'CANCELLED' }, [['RENT', 900_000]]);

    await expect(settle([{ invoiceId: 'paid', amountPaise: 100 }])).rejects.toThrow(/nothing left to settle/);
    await expect(settle([{ invoiceId: 'gone', amountPaise: 100 }])).rejects.toThrow(/nothing left to settle/);
  });

  it('refuses a bill that belongs to someone else', async () => {
    w.addBill({ id: 'theirs', category: 'RENT', tenancyId: 'other' }, [['RENT', 900_000]]);

    await expect(settle([{ invoiceId: 'theirs', amountPaise: 100 }])).rejects.toThrow(/not found/);
  });

  it('refuses an empty settlement', async () => {
    rentBill();

    await expect(settle([{ invoiceId: 'rent', amountPaise: 0 }])).rejects.toThrow(/Enter an amount/);
  });

  it('changes nothing when any one line is refused', async () => {
    rentBill();
    w.addBill({ id: 'elec', category: 'ELECTRICITY' }, [['ELECTRICITY', 25_000]]);

    await expect(
      settle([
        { invoiceId: 'rent', amountPaise: 100_000 },
        { invoiceId: 'elec', amountPaise: 25_001 },
      ]),
    ).rejects.toThrow();

    expect(w.settlements).toHaveLength(0);
    expect(bill('rent').items.some((item) => item.kind === 'SETTLEMENT')).toBe(false);
  });
});

describe('the deposit and several bills at once', () => {
  it('lowers the deposit held by the amount of deposit forgiven', async () => {
    w.addBill({ id: 'dep', category: 'DEPOSIT', periodKey: 'DEPOSIT' }, [['DEPOSIT', 1_150_000]]);

    await settle([{ invoiceId: 'dep', amountPaise: 500_000 }]);

    expect(bill('dep').totalPaise).toBe(650_000);
    expect(w.state.deposit).toBe(650_000);
  });

  it('settles rent, electricity and deposit together on one numbered receipt', async () => {
    rentBill();
    w.addBill({ id: 'elec', category: 'ELECTRICITY' }, [['ELECTRICITY', 25_000]]);
    w.addBill({ id: 'dep', category: 'DEPOSIT', periodKey: 'DEPOSIT' }, [['DEPOSIT', 1_150_000]]);

    const receipt = await settle([
      { invoiceId: 'rent', amountPaise: 900_000, lateFeePaise: 40_000 },
      { invoiceId: 'elec', amountPaise: 25_000 },
      { invoiceId: 'dep', amountPaise: 150_000 },
    ]);

    expect(receipt.number).toBe('HH/S/2026-27/0001');
    expect(receipt.lines.map((line) => line.category)).toEqual(['RENT', 'ELECTRICITY', 'DEPOSIT']);
    expect(receipt.settledPaise).toBe(900_000 + 25_000 + 150_000);
    expect(receipt.lateFeeForgivenPaise).toBe(40_000);
    expect(bill('elec').status).toBe('PAID');
    expect(bill('dep').totalPaise).toBe(1_000_000);
    expect(receipt.note).toBe('Fixed the geyser');
    expect(receipt.residentName).toBe('Divyansh Gupta');
    expect(receipt.roomNumber).toBe('104');
  });

  it('numbers each settlement one after the other', async () => {
    rentBill();
    const first = await settle([{ invoiceId: 'rent', amountPaise: 100_000 }]);
    const second = await settle([{ invoiceId: 'rent', amountPaise: 100_000 }]);

    expect(first.number).toBe('HH/S/2026-27/0001');
    expect(second.number).toBe('HH/S/2026-27/0002');
  });

  it('marks each settled line so it can be traced back to its receipt', async () => {
    rentBill();

    const receipt = await settle([{ invoiceId: 'rent', amountPaise: 100_000 }]);

    const line = bill('rent').items.find((item) => item.kind === 'SETTLEMENT');
    expect(line?.amountPaise).toBe(-100_000);
    expect(line?.sourceType).toBe('Settlement');
    expect(line?.sourceId).toBe(receipt.id);
  });
});

describe('records, repeats and the resident', () => {
  it('writes an audit entry naming who settled and what for', async () => {
    rentBill();

    await settle([{ invoiceId: 'rent', amountPaise: 100_000 }]);

    expect(w.audits).toHaveLength(1);
    expect(w.audits[0]?.['action']).toBe('BALANCE_SETTLED');
    expect(w.audits[0]?.['actorUserId']).toBe('admin-1');
    expect(JSON.stringify(w.audits[0]?.['after'])).toContain('Fixed the geyser');
  });

  it('tells the resident, once, how much was settled', async () => {
    rentBill();

    const receipt = await settle([{ invoiceId: 'rent', amountPaise: 100_000, lateFeePaise: 20_000 }]);

    expect(holder.notify).toHaveBeenCalledTimes(1);
    expect(holder.notify).toHaveBeenCalledWith({
      event: 'BALANCE_SETTLED',
      userId: 'resident-1',
      dedupeKey: receipt.id,
      params: { amountPaise: 120_000, receiptNumber: receipt.number },
    });
  });

  it('returns the same receipt, and settles only once, when the same request is sent twice', async () => {
    rentBill();

    const first = await settle([{ invoiceId: 'rent', amountPaise: 100_000 }], { idempotencyKey: 'tap-1' });
    const second = await settle([{ invoiceId: 'rent', amountPaise: 100_000 }], { idempotencyKey: 'tap-1' });

    expect(second.id).toBe(first.id);
    expect(w.settlements).toHaveLength(1);
    expect(bill('rent').items.filter((item) => item.kind === 'SETTLEMENT')).toHaveLength(1);
    expect(holder.notify).toHaveBeenCalledTimes(1);
  });
});

describe('planning a settlement', () => {
  const rent = {
    id: 'r',
    number: 'INV-1',
    category: 'RENT' as const,
    status: 'ISSUED',
    periodKey: '2026-11',
    amountPaidPaise: 0,
    items: [{ kind: 'RENT', amountPaise: 900_000 }],
  };

  it('refuses the same bill listed twice', () => {
    expect(() =>
      planSettlement([rent], [
        { invoiceId: 'r', amountPaise: 1, lateFeePaise: 0 },
        { invoiceId: 'r', amountPaise: 1, lateFeePaise: 0 },
      ]),
    ).toThrow(/twice/);
  });

  it('skips a bill that was ticked but left at zero, as long as something else is settled', () => {
    const electricity = { ...rent, id: 'e', category: 'ELECTRICITY' as const, items: [{ kind: 'ELECTRICITY', amountPaise: 25_000 }] };

    const plan = planSettlement([rent, electricity], [
      { invoiceId: 'r', amountPaise: 0, lateFeePaise: 0 },
      { invoiceId: 'e', amountPaise: 25_000, lateFeePaise: 0 },
    ]);

    expect(plan.map((line) => line.invoice.id)).toEqual(['e']);
  });

  it('allows forgiving a late fee when the rent itself is already paid', () => {
    const paidRent = {
      ...rent,
      amountPaidPaise: 900_000,
      status: 'OVERDUE',
      items: [
        { kind: 'RENT', amountPaise: 900_000 },
        { kind: 'LATE_FEE', amountPaise: 30_000 },
      ],
    };

    expect(planSettlement([paidRent], [{ invoiceId: 'r', amountPaise: 0, lateFeePaise: 30_000 }])).toHaveLength(1);
  });
});
