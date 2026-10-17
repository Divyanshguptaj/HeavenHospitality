import { describe, expect, it } from 'vitest';

import { billDueDate, nextPeriodKey } from '../src/lib/dates.js';
import { staysIntoPeriod } from '../src/modules/billing/billing.calculations.js';

describe('the due date of a bill', () => {
  it('is the 1st of the month, for rent billed ahead on the last day before', () => {
    expect(billDueDate('2026-11', '2026-10-31', 0)).toBe('2026-11-01');
    expect(billDueDate('2026-03', '2026-02-28', 0)).toBe('2026-03-01');
    expect(billDueDate('2027-01', '2026-12-31', 0)).toBe('2027-01-01');
  });

  it('is never in the past when the bill is created later', () => {
    expect(billDueDate('2026-11', '2026-11-01', 0)).toBe('2026-11-01');
    expect(billDueDate('2026-10', '2026-10-20', 0)).toBe('2026-10-20');
  });

  it('adds grace days only when the property still sets any', () => {
    expect(billDueDate('2026-10', '2026-10-20', 3)).toBe('2026-10-23');
  });
});

describe('the next period', () => {
  it('moves forward one month and wraps over the year end', () => {
    expect(nextPeriodKey('2026-10')).toBe('2026-11');
    expect(nextPeriodKey('2026-12')).toBe('2027-01');
    expect(nextPeriodKey('2026-01')).toBe('2026-02');
  });
});

describe('who is billed ahead of next month', () => {
  const start = '2026-11-01';
  const stay = { status: 'ACTIVE', actualExitDate: null, expectedExitDate: null };

  it('includes someone staying with no exit planned', () => {
    expect(staysIntoPeriod(stay, start)).toBe(true);
  });

  it('includes someone on notice who leaves during or after next month', () => {
    expect(
      staysIntoPeriod({ ...stay, status: 'NOTICE_PERIOD', expectedExitDate: '2026-11-01' }, start),
    ).toBe(true);
    expect(staysIntoPeriod({ ...stay, expectedExitDate: '2026-11-20' }, start)).toBe(true);
  });

  it('leaves out someone whose notice ends before next month starts', () => {
    expect(staysIntoPeriod({ ...stay, expectedExitDate: '2026-10-31' }, start)).toBe(false);
    expect(staysIntoPeriod({ ...stay, expectedExitDate: '2026-10-15' }, start)).toBe(false);
  });

  it('leaves out anyone who has already moved out', () => {
    expect(
      staysIntoPeriod({ ...stay, status: 'VACATED', actualExitDate: '2026-10-10' }, start),
    ).toBe(false);
    expect(staysIntoPeriod({ ...stay, actualExitDate: '2026-10-10' }, start)).toBe(false);
  });
});
