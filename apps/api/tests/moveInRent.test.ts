import type { PropertySettings } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({ prisma: {} }));

const {
  generateMoveInRentInvoice,
  generateDepositInvoice,
  generateInvoiceForTenancy,
  recomputeInvoice,
} = await import(
  '../src/modules/billing/invoice.service.js'
);
type Tx = Parameters<typeof generateMoveInRentInvoice>[0];

const settings = {
  rentDueDay: 1,
  graceDays: 0,
  lateFeePerDayPaise: 10_000,
  lateFeeCapPaise: 300_000,
} as PropertySettings;

interface Item {
  id: string;
  kind: string;
  description: string;
  amountPaise: number;
}
interface Inv {
  id: string;
  category: string;
  periodKey: string;
  dueDate: Date;
  issueDate: Date;
  items: Item[];
  amountPaidPaise: number;
  lateFeeWaivedAt: Date | null;
  totalPaise: number;
  status: string;
}

function fakeTx(options: { roomRentPaise?: number; existingRent?: boolean } = {}) {
  const invoices = new Map<string, Inv>();
  const audits: Array<Record<string, unknown>> = [];
  let itemSeq = 0;

  const tx = {
    bed: {
      findUniqueOrThrow: () =>
        Promise.resolve({ room: { monthlyRentPaise: options.roomRentPaise ?? 900_000 } }),
    },
    invoice: {
      findUnique: () => Promise.resolve(options.existingRent === true ? { id: 'existing' } : null),
      count: () => Promise.resolve(0),
      create: ({ data }: { data: Record<string, unknown> & { items: { create: Item[] } } }) => {
        const invoice: Inv = {
          id: `inv${invoices.size + 1}`,
          category: data['category'] as string,
          periodKey: data['periodKey'] as string,
          dueDate: data['dueDate'] as Date,
          issueDate: data['issueDate'] as Date,
          items: data.items.create.map((item) => ({ ...item, id: `it${(itemSeq += 1)}` })),
          amountPaidPaise: 0,
          lateFeeWaivedAt: null,
          totalPaise: 0,
          status: 'ISSUED',
        };
        invoices.set(invoice.id, invoice);
        return Promise.resolve(invoice);
      },
      findUniqueOrThrow: ({ where }: { where: { id: string } }) =>
        Promise.resolve(invoices.get(where.id)),
      update: ({ where, data }: { where: { id: string }; data: Partial<Inv> }) => {
        Object.assign(invoices.get(where.id) as Inv, data);
        return Promise.resolve();
      },
    },
    invoiceItem: {
      create: ({ data }: { data: Omit<Item, 'id'> & { invoiceId: string } }) => {
        invoices.get(data.invoiceId)?.items.push({ ...data, id: `it${(itemSeq += 1)}` });
        return Promise.resolve();
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<Item> }) => {
        for (const invoice of invoices.values()) {
          const item = invoice.items.find((candidate) => candidate.id === where.id);
          if (item !== undefined) Object.assign(item, data);
        }
        return Promise.resolve();
      },
      delete: ({ where }: { where: { id: string } }) => {
        for (const invoice of invoices.values()) {
          invoice.items = invoice.items.filter((item) => item.id !== where.id);
        }
        return Promise.resolve();
      },
    },
    auditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return Promise.resolve();
      },
    },
  };
  return { tx: tx as unknown as Tx, invoices, audits };
}

const baseParams = {
  propertyId: 'p1',
  tenancyId: 't1',
  residentName: 'Rahul',
  bedId: 'b1',
  monthlyRentOverridePaise: undefined,
  settings,
  actor: { userId: 'admin-1', role: 'ADMIN' },
};

describe('the move-in rent invoice', () => {
  it('bills the full room rent for the move-in month', async () => {
    const { tx, invoices, audits } = fakeTx({ roomRentPaise: 900_000 });

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-07',
      today: '2026-10-07',
    });

    expect(result?.totalPaise).toBe(900_000);
    expect(result?.periodKey).toBe('2026-10');
    const invoice = [...invoices.values()][0];
    expect(invoice?.category).toBe('RENT');
    expect(invoice?.items.map((item) => item.amountPaise)).toEqual([900_000]);
    expect(invoice?.totalPaise).toBe(900_000);
    expect(audits[0]?.['action']).toBe('INVOICE_ISSUED');
  });

  it('uses the tenancy rent override instead of the room rent', async () => {
    const { tx } = fakeTx({ roomRentPaise: 900_000 });

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      monthlyRentOverridePaise: 750_000,
      startDate: '2026-10-07',
      today: '2026-10-07',
    });

    expect(result?.totalPaise).toBe(750_000);
  });

  it('is due the day they move in, with the late fee starting the day after', async () => {
    const { tx } = fakeTx();

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-20',
      today: '2026-10-20',
    });

    expect(result?.dueDate).toBe('2026-10-20');
  });

  it('is due the day they move in even on the first of the month', async () => {
    const { tx } = fakeTx();

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-01',
      today: '2026-10-01',
    });

    expect(result?.dueDate).toBe('2026-10-01');
  });

  it('does nothing when the period already has a rent invoice', async () => {
    const { tx, invoices } = fakeTx({ existingRent: true });

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-07',
      today: '2026-10-07',
    });

    expect(result).toBeNull();
    expect(invoices.size).toBe(0);
  });

  it('does nothing for a room with no rent set', async () => {
    const { tx, invoices } = fakeTx({ roomRentPaise: 0 });

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-07',
      today: '2026-10-07',
    });

    expect(result).toBeNull();
    expect(invoices.size).toBe(0);
  });
});

/** Puts a bill for November, due 1 November, straight into the fake database. */
function novemberBill(tx: Tx, category = 'RENT', amountPaise = 900_000) {
  return (
    tx as unknown as { invoice: { create: (args: unknown) => Promise<Inv> } }
  ).invoice.create({
    data: {
      category,
      periodKey: '2026-11',
      dueDate: new Date(Date.UTC(2026, 10, 1)),
      issueDate: new Date(Date.UTC(2026, 9, 31)),
      items: {
        create: [
          {
            kind: category === 'ELECTRICITY' ? 'ELECTRICITY' : 'RENT',
            description: 'Bill',
            amountPaise,
          },
        ],
      },
    },
  });
}

describe('late fees', () => {
  async function rentFee(asOf: string) {
    const { tx, invoices } = fakeTx();
    await novemberBill(tx);
    await recomputeInvoice(tx, 'inv1', settings, asOf);
    const invoice = invoices.get('inv1') as Inv;
    return { invoice, fee: invoice.items.find((item) => item.kind === 'LATE_FEE')?.amountPaise };
  }

  it('adds nothing on the 1st, the day rent is due', async () => {
    expect((await rentFee('2026-11-01')).fee).toBeUndefined();
  });

  it('adds Rs 100 on the 2nd, with no grace period', async () => {
    const { invoice, fee } = await rentFee('2026-11-02');
    expect(fee).toBe(10_000);
    expect(invoice.totalPaise).toBe(910_000);
  });

  it('adds Rs 100 for every further day rent stays unpaid', async () => {
    expect((await rentFee('2026-11-06')).fee).toBe(50_000);
  });

  it('stops growing at the Rs 3,000 cap', async () => {
    expect((await rentFee('2027-01-15')).fee).toBe(300_000);
  });

  it('is the same on every nightly run rather than adding up', async () => {
    const { tx, invoices } = fakeTx();
    await novemberBill(tx);

    await recomputeInvoice(tx, 'inv1', settings, '2026-11-05');
    await recomputeInvoice(tx, 'inv1', settings, '2026-11-05');
    await recomputeInvoice(tx, 'inv1', settings, '2026-11-05');

    const invoice = invoices.get('inv1') as Inv;
    expect(invoice.items.filter((item) => item.kind === 'LATE_FEE')).toHaveLength(1);
    expect(invoice.totalPaise).toBe(940_000);
  });

  it('marks unpaid rent overdue once the due day has passed', async () => {
    expect((await rentFee('2026-11-01')).invoice.status).toBe('ISSUED');
    expect((await rentFee('2026-11-02')).invoice.status).toBe('OVERDUE');
  });

  it('never charges a late fee on an electricity bill, however late', async () => {
    const { tx, invoices } = fakeTx();
    await novemberBill(tx, 'ELECTRICITY', 25_000);

    await recomputeInvoice(tx, 'inv1', settings, '2027-03-01');

    const invoice = invoices.get('inv1') as Inv;
    expect(invoice.items.some((item) => item.kind === 'LATE_FEE')).toBe(false);
    expect(invoice.totalPaise).toBe(25_000);
  });

  it('removes a late fee an electricity bill picked up under the old rule', async () => {
    const { tx, invoices } = fakeTx();
    await novemberBill(tx, 'ELECTRICITY', 25_000);
    (invoices.get('inv1') as Inv).items.push({
      id: 'old-fee',
      kind: 'LATE_FEE',
      description: 'Late fee - 4 day(s)',
      amountPaise: 40_000,
    });

    await recomputeInvoice(tx, 'inv1', settings, '2026-11-20');

    const invoice = invoices.get('inv1') as Inv;
    expect(invoice.items.some((item) => item.kind === 'LATE_FEE')).toBe(false);
    expect(invoice.totalPaise).toBe(25_000);
  });

  it('never shows an unpaid electricity bill as overdue', async () => {
    const { tx, invoices } = fakeTx();
    await novemberBill(tx, 'ELECTRICITY', 25_000);

    await recomputeInvoice(tx, 'inv1', settings, '2027-03-01');

    expect((invoices.get('inv1') as Inv).status).toBe('ISSUED');
  });

  it('never adds a late fee to an unpaid security deposit', async () => {
    const { tx, invoices } = fakeTx();
    await generateDepositInvoice(tx, {
      propertyId: 'p1',
      tenancyId: 't1',
      residentName: 'Rahul',
      amountPaise: 1_150_000,
      issueDate: '2026-10-07',
      settings,
      today: '2026-10-07',
    });

    await recomputeInvoice(tx, 'inv1', settings, '2027-03-01');

    const invoice = invoices.get('inv1') as Inv;
    expect(invoice.items.some((item) => item.kind === 'LATE_FEE')).toBe(false);
    expect(invoice.totalPaise).toBe(1_150_000);
  });
});

describe('next month rent bill, created on the last day of the month', () => {
  const tenancy = {
    id: 't1',
    joiningDate: new Date(Date.UTC(2026, 8, 1)),
    actualExitDate: null,
    monthlyRentOverridePaise: null,
    user: { fullName: 'Rahul' },
    allocations: [{ bed: { room: { monthlyRentPaise: 900_000, number: '101' } } }],
    electricityShares: [],
  };

  it('is due on the 1st, so the late fee starts on the 2nd', async () => {
    const { tx, invoices } = fakeTx();

    await generateInvoiceForTenancy(tx, {
      propertyId: 'p1',
      periodKey: '2026-11',
      settings,
      today: '2026-10-31',
      tenancy: tenancy as never,
    });

    const bill = [...invoices.values()][0];
    expect(bill?.category).toBe('RENT');
    expect(bill?.periodKey).toBe('2026-11');
    expect(bill?.dueDate.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(bill?.issueDate.toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(bill?.totalPaise).toBe(900_000);
  });

  it('is not charged a late fee for being created late', async () => {
    const { tx, invoices } = fakeTx();

    await generateInvoiceForTenancy(tx, {
      propertyId: 'p1',
      periodKey: '2026-11',
      settings,
      today: '2026-11-01',
      tenancy: tenancy as never,
    });

    // A bill that only appeared on the 1st is due the 1st, and the fee starts the 2nd.
    expect([...invoices.values()][0]?.dueDate.toISOString().slice(0, 10)).toBe('2026-11-01');
  });
});
