import type { PropertySettings } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({ prisma: {} }));

const { generateMoveInRentInvoice, generateDepositInvoice, recomputeInvoice } = await import(
  '../src/modules/billing/invoice.service.js'
);
type Tx = Parameters<typeof generateMoveInRentInvoice>[0];

const settings = {
  rentDueDay: 5,
  graceDays: 3,
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

  it('is never born overdue for someone moving in after the calendar due date', async () => {
    const { tx } = fakeTx();

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-20',
      today: '2026-10-20',
    });

    // The calendar due date, 5 October, is long gone; grace restarts from the move-in day.
    expect(result?.dueDate).toBe('2026-10-23');
  });

  it('keeps the calendar due date when moving in early in the month', async () => {
    const { tx } = fakeTx();

    const result = await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-01',
      today: '2026-10-01',
    });

    expect(result?.dueDate).toBe('2026-10-05');
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

describe('late fees', () => {
  async function rentInvoiceAfter(days: number) {
    const { tx, invoices } = fakeTx();
    await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-01',
      today: '2026-10-01',
    });
    // Due 5 Oct with 3 days of grace, so the fee starts counting after 8 Oct.
    const asOf = new Date(Date.UTC(2026, 9, 8 + days)).toISOString().slice(0, 10);
    await recomputeInvoice(tx, 'inv1', settings, asOf);
    return invoices.get('inv1') as Inv;
  }

  it('charges nothing for unpaid rent until the grace period has passed', async () => {
    const invoice = await rentInvoiceAfter(0);
    expect(invoice.items.some((item) => item.kind === 'LATE_FEE')).toBe(false);
    expect(invoice.totalPaise).toBe(900_000);
  });

  it('adds Rs 100 for each day unpaid rent stays overdue after the grace period', async () => {
    const invoice = await rentInvoiceAfter(4);
    expect(invoice.items.find((item) => item.kind === 'LATE_FEE')?.amountPaise).toBe(40_000);
    expect(invoice.totalPaise).toBe(940_000);
  });

  it('is the same on every nightly run rather than adding up', async () => {
    const { tx, invoices } = fakeTx();
    await generateMoveInRentInvoice(tx, {
      ...baseParams,
      startDate: '2026-10-01',
      today: '2026-10-01',
    });

    await recomputeInvoice(tx, 'inv1', settings, '2026-10-12');
    await recomputeInvoice(tx, 'inv1', settings, '2026-10-12');
    await recomputeInvoice(tx, 'inv1', settings, '2026-10-12');

    const invoice = invoices.get('inv1') as Inv;
    expect(invoice.items.filter((item) => item.kind === 'LATE_FEE')).toHaveLength(1);
    expect(invoice.totalPaise).toBe(940_000);
  });

  it('stops growing at the Rs 3,000 cap', async () => {
    const invoice = await rentInvoiceAfter(90);
    expect(invoice.items.find((item) => item.kind === 'LATE_FEE')?.amountPaise).toBe(300_000);
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
