import { recordPaymentSchema } from '@heaven/contracts';
import { describe, expect, it } from 'vitest';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const base = { tenancyId: ID, method: 'CASH', paidAt: '2026-09-26' };

describe('recordPaymentSchema', () => {
  it('accepts a payment covering a subset of bills with custom amounts', () => {
    const result = recordPaymentSchema.safeParse({
      ...base,
      allocations: [
        { invoiceId: ID, amountPaise: 500_000 },
        { invoiceId: ID.replace('a1', 'b2'), amountPaise: 20_000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payment that covers nothing', () => {
    expect(recordPaymentSchema.safeParse({ ...base, allocations: [] }).success).toBe(false);
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const amountPaise of [0, -100, 10.5]) {
      const result = recordPaymentSchema.safeParse({
        ...base,
        allocations: [{ invoiceId: ID, amountPaise }],
      });
      expect(result.success).toBe(false);
    }
  });

  it('no longer accepts the old single-invoice shape', () => {
    expect(
      recordPaymentSchema.safeParse({ ...base, invoiceId: ID, amountPaise: 1000 }).success,
    ).toBe(false);
  });
});
