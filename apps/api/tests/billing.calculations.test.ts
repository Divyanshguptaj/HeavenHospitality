import { sumPaise } from '@heaven/money';
import { describe, expect, it } from 'vitest';

import {
  applyPaymentToInvoices,
  calculateElectricity,
  calculateLateFee,
  calculateRent,
  deriveInvoiceStatus,
  splitElectricity,
  type LateFeeInput,
} from '../src/modules/billing/billing.calculations.js';

const RENT_8000 = 800_000;

describe('calculateRent', () => {
  it('charges the exact configured rent for a full month', () => {
    const result = calculateRent({
      periodKey: '2026-09',
      monthlyRentPaise: RENT_8000,
      joiningDate: '2026-01-01',
      exitDate: null,
    });

    // Never a rounded approximation of the configured amount.
    expect(result.amountPaise).toBe(RENT_8000);
    expect(result.isProrated).toBe(false);
    expect(result.occupiedDays).toBe(30);
  });

  it('pro-rates a resident who joins mid-month', () => {
    // Joined 20 Sept: 11 of 30 days.
    const result = calculateRent({
      periodKey: '2026-09',
      monthlyRentPaise: RENT_8000,
      joiningDate: '2026-09-20',
      exitDate: null,
    });

    expect(result.occupiedDays).toBe(11);
    expect(result.amountPaise).toBe(293_333);
    expect(result.isProrated).toBe(true);
  });

  it('pro-rates a resident who leaves mid-month', () => {
    // Left 10 Sept: 10 of 30 days, inclusive of the exit day.
    const result = calculateRent({
      periodKey: '2026-09',
      monthlyRentPaise: RENT_8000,
      joiningDate: '2026-01-01',
      exitDate: '2026-09-10',
    });

    expect(result.occupiedDays).toBe(10);
    expect(result.amountPaise).toBe(266_667);
  });

  it('charges nothing for a period the resident had already left', () => {
    const result = calculateRent({
      periodKey: '2026-09',
      monthlyRentPaise: RENT_8000,
      joiningDate: '2026-01-01',
      exitDate: '2026-08-31',
    });

    expect(result.occupiedDays).toBe(0);
    expect(result.amountPaise).toBe(0);
  });

  it('charges nothing for a period before the resident joined', () => {
    const result = calculateRent({
      periodKey: '2026-09',
      monthlyRentPaise: RENT_8000,
      joiningDate: '2026-10-01',
      exitDate: null,
    });

    expect(result.amountPaise).toBe(0);
  });

  it('handles February without a special case', () => {
    const result = calculateRent({
      periodKey: '2026-02',
      monthlyRentPaise: RENT_8000,
      joiningDate: '2026-01-01',
      exitDate: null,
    });

    expect(result.daysInPeriod).toBe(28);
    expect(result.amountPaise).toBe(RENT_8000);
  });
});

describe('calculateLateFee', () => {
  const base: LateFeeInput = {
    dueDate: '2026-09-05',
    graceDays: 3,
    perDayPaise: 10_000, // ₹100/day
    capPaise: 300_000, // ₹3,000
    asOf: '2026-09-05',
    settledOn: null,
    isWaived: false,
    outstandingPaise: 800_000,
  };

  it('charges nothing on the due date', () => {
    expect(calculateLateFee(base).amountPaise).toBe(0);
  });

  it('charges nothing during the grace period', () => {
    expect(calculateLateFee({ ...base, asOf: '2026-09-08' }).amountPaise).toBe(0);
  });

  it('starts charging the day after grace ends', () => {
    const result = calculateLateFee({ ...base, asOf: '2026-09-09' });
    expect(result.overdueDays).toBe(1);
    expect(result.amountPaise).toBe(10_000);
  });

  it('accrues per day', () => {
    expect(calculateLateFee({ ...base, asOf: '2026-09-15' }).amountPaise).toBe(70_000);
  });

  it('is capped, and reports that it capped', () => {
    // 100 days would be ₹10,000 without the cap.
    const result = calculateLateFee({ ...base, asOf: '2026-12-17' });
    expect(result.amountPaise).toBe(300_000);
    expect(result.isCapped).toBe(true);
  });

  it('stops accruing on the settlement date, not today', () => {
    // Settled on the 15th; by December the fee must still be the 15th's figure.
    const atSettlement = calculateLateFee({ ...base, asOf: '2026-09-15', settledOn: '2026-09-15' });
    const muchLater = calculateLateFee({ ...base, asOf: '2026-12-31', settledOn: '2026-09-15' });

    expect(muchLater.amountPaise).toBe(atSettlement.amountPaise);
    expect(muchLater.amountPaise).toBe(70_000);
  });

  it('charges nothing once waived', () => {
    expect(calculateLateFee({ ...base, asOf: '2026-12-31', isWaived: true }).amountPaise).toBe(0);
  });

  it('charges nothing when there is no outstanding principal', () => {
    expect(calculateLateFee({ ...base, asOf: '2026-12-31', outstandingPaise: 0 }).amountPaise).toBe(
      0,
    );
  });

  it('charges nothing when the owner has set the rate to zero', () => {
    expect(calculateLateFee({ ...base, asOf: '2026-12-31', perDayPaise: 0 }).amountPaise).toBe(0);
  });

  it('is idempotent — the whole point of recomputing rather than accruing', () => {
    // Running the nightly job any number of times must converge on one value.
    const runs = Array.from(
      { length: 50 },
      () => calculateLateFee({ ...base, asOf: '2026-09-20' }).amountPaise,
    );
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe(120_000);
  });

  it('self-heals after a missed run instead of under-charging', () => {
    // A job that never ran on the 10th still produces the right total on the 20th.
    expect(calculateLateFee({ ...base, asOf: '2026-09-20' }).amountPaise).toBe(120_000);
  });

  it('respects a zero grace period', () => {
    const result = calculateLateFee({ ...base, graceDays: 0, asOf: '2026-09-06' });
    expect(result.amountPaise).toBe(10_000);
  });
});

describe('calculateElectricity', () => {
  it('computes units and amount at the supplied rate', () => {
    // The spec's worked example: 12450 → 12510 at ₹13/unit = ₹780.
    const result = calculateElectricity({
      previousReading: 12_450,
      currentReading: 12_510,
      ratePaisePerUnit: 1_300,
    });

    expect(result.units).toBe(60);
    expect(result.amountPaise).toBe(78_000);
  });

  it('handles a month with no consumption', () => {
    const result = calculateElectricity({
      previousReading: 500,
      currentReading: 500,
      ratePaisePerUnit: 1_300,
    });
    expect(result).toEqual({ units: 0, amountPaise: 0 });
  });

  it('refuses a reading that runs backwards', () => {
    expect(() =>
      calculateElectricity({ previousReading: 900, currentReading: 800, ratePaisePerUnit: 1_300 }),
    ).toThrow(/lower than the previous/);
  });
});

describe('splitElectricity', () => {
  it('splits equally when everyone occupied the whole month', () => {
    const shares = splitElectricity(78_000, '2026-09', [
      { tenancyId: 'a', startedOn: '2026-01-01', endedOn: null },
      { tenancyId: 'b', startedOn: '2026-01-01', endedOn: null },
      { tenancyId: 'c', startedOn: '2026-01-01', endedOn: null },
    ]);

    expect(shares.map((s) => s.sharePaise)).toEqual([26_000, 26_000, 26_000]);
  });

  it('weights by occupied days when someone joined mid-month', () => {
    const shares = splitElectricity(78_000, '2026-09', [
      { tenancyId: 'a', startedOn: '2026-01-01', endedOn: null }, // 30 days
      { tenancyId: 'b', startedOn: '2026-09-25', endedOn: null }, // 6 days
    ]);

    expect(shares[0]?.occupiedDays).toBe(30);
    expect(shares[1]?.occupiedDays).toBe(6);
    expect(shares[0]?.sharePaise).toBeGreaterThan(shares[1]?.sharePaise ?? 0);
  });

  it('never creates or loses a paise, whatever the weights', () => {
    const cases: ReadonlyArray<[number, Array<{ tenancyId: string; startedOn: string }>]> = [
      [
        78_000,
        [
          { tenancyId: 'a', startedOn: '2026-01-01' },
          { tenancyId: 'b', startedOn: '2026-09-25' },
        ],
      ],
      [
        1,
        [
          { tenancyId: 'a', startedOn: '2026-01-01' },
          { tenancyId: 'b', startedOn: '2026-01-01' },
        ],
      ],
      [
        99_999,
        [
          { tenancyId: 'a', startedOn: '2026-09-02' },
          { tenancyId: 'b', startedOn: '2026-09-11' },
          { tenancyId: 'c', startedOn: '2026-09-17' },
        ],
      ],
    ];

    for (const [amount, occupants] of cases) {
      const shares = splitElectricity(
        amount,
        '2026-09',
        occupants.map((o) => ({ ...o, endedOn: null })),
      );
      expect(sumPaise(shares.map((s) => s.sharePaise))).toBe(amount);
    }
  });

  it('returns nothing to split when the room was empty', () => {
    expect(splitElectricity(78_000, '2026-09', [])).toEqual([]);
  });

  it('allocates nothing when no occupant was present during the period', () => {
    const shares = splitElectricity(78_000, '2026-09', [
      { tenancyId: 'a', startedOn: '2026-10-01', endedOn: null },
    ]);
    expect(shares[0]?.sharePaise).toBe(0);
  });
});

describe('applyPaymentToInvoices', () => {
  const invoices = [
    { invoiceId: 'sep', dueDate: '2026-09-05', outstandingPaise: 500_000 },
    { invoiceId: 'jul', dueDate: '2026-07-05', outstandingPaise: 300_000 },
    { invoiceId: 'aug', dueDate: '2026-08-05', outstandingPaise: 200_000 },
  ];

  it('settles the oldest invoice first', () => {
    // Otherwise an old debt sits unpaid, accruing late fees forever.
    const result = applyPaymentToInvoices(400_000, invoices);
    expect(result.applications[0]).toEqual({ invoiceId: 'jul', amountPaise: 300_000 });
    expect(result.applications[1]).toEqual({ invoiceId: 'aug', amountPaise: 100_000 });
  });

  it('supports a partial payment', () => {
    const result = applyPaymentToInvoices(100_000, invoices);
    expect(result.applications).toEqual([{ invoiceId: 'jul', amountPaise: 100_000 }]);
    expect(result.unallocatedPaise).toBe(0);
  });

  it('holds an overpayment as credit rather than forcing it onto an invoice', () => {
    const result = applyPaymentToInvoices(1_200_000, invoices);
    expect(sumPaise(result.applications.map((a) => a.amountPaise))).toBe(1_000_000);
    expect(result.unallocatedPaise).toBe(200_000);
  });

  it('treats a payment with nothing outstanding as entirely credit', () => {
    const result = applyPaymentToInvoices(50_000, []);
    expect(result.applications).toEqual([]);
    expect(result.unallocatedPaise).toBe(50_000);
  });

  it('settles the invoice the owner directed the payment at, first', () => {
    // The owner said "this ₹500 is for September". Ignoring that and paying down
    // July instead leaves them looking at an invoice they just paid.
    const result = applyPaymentToInvoices(500_000, invoices, 'sep');
    expect(result.applications[0]).toEqual({ invoiceId: 'sep', amountPaise: 500_000 });
  });

  it('falls back to oldest-first for whatever is left over', () => {
    const result = applyPaymentToInvoices(700_000, invoices, 'sep');
    expect(result.applications[0]).toEqual({ invoiceId: 'sep', amountPaise: 500_000 });
    expect(result.applications[1]).toEqual({ invoiceId: 'jul', amountPaise: 200_000 });
  });

  it('ignores a preferred invoice that has nothing outstanding', () => {
    const result = applyPaymentToInvoices(100_000, invoices, 'does-not-exist');
    expect(result.applications[0]).toEqual({ invoiceId: 'jul', amountPaise: 100_000 });
  });

  it('never allocates more than the payment', () => {
    const result = applyPaymentToInvoices(999, invoices);
    expect(sumPaise(result.applications.map((a) => a.amountPaise))).toBe(999);
  });
});

describe('deriveInvoiceStatus', () => {
  const dueDate = '2026-09-05';

  it('is PAID once the full amount is covered', () => {
    expect(
      deriveInvoiceStatus({
        totalPaise: 800_000,
        amountPaidPaise: 800_000,
        dueDate,
        asOf: '2026-12-01',
      }),
    ).toBe('PAID');
  });

  it('is PAID when overpaid', () => {
    expect(
      deriveInvoiceStatus({
        totalPaise: 800_000,
        amountPaidPaise: 900_000,
        dueDate,
        asOf: '2026-09-01',
      }),
    ).toBe('PAID');
  });

  it('is ISSUED before the due date with nothing paid', () => {
    expect(
      deriveInvoiceStatus({ totalPaise: 800_000, amountPaidPaise: 0, dueDate, asOf: '2026-09-01' }),
    ).toBe('ISSUED');
  });

  it('is PARTIALLY_PAID before the due date', () => {
    expect(
      deriveInvoiceStatus({
        totalPaise: 800_000,
        amountPaidPaise: 100_000,
        dueDate,
        asOf: '2026-09-01',
      }),
    ).toBe('PARTIALLY_PAID');
  });

  it('is OVERDUE after the due date, paid or not', () => {
    expect(
      deriveInvoiceStatus({ totalPaise: 800_000, amountPaidPaise: 0, dueDate, asOf: '2026-09-06' }),
    ).toBe('OVERDUE');
    expect(
      deriveInvoiceStatus({
        totalPaise: 800_000,
        amountPaidPaise: 100_000,
        dueDate,
        asOf: '2026-09-06',
      }),
    ).toBe('OVERDUE');
  });

  it('is not overdue on the due date itself', () => {
    expect(
      deriveInvoiceStatus({ totalPaise: 800_000, amountPaidPaise: 0, dueDate, asOf: dueDate }),
    ).toBe('ISSUED');
  });
});
