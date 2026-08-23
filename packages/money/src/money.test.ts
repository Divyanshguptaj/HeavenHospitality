import { describe, expect, it } from 'vitest';

import {
  MAX_AMOUNT_PAISE,
  MoneyError,
  allocatePaise,
  formatINR,
  multiplyPaise,
  paiseToRupeeString,
  percentOfPaise,
  proratePaise,
  roundPaise,
  rupeesToPaise,
  sumPaise,
} from './index.js';

describe('roundPaise', () => {
  it('rounds half away from zero', () => {
    expect(roundPaise(10.5)).toBe(11);
    expect(roundPaise(10.4)).toBe(10);
    expect(roundPaise(-10.5)).toBe(-11);
    expect(roundPaise(-10.4)).toBe(-10);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundPaise(-0.2), 0)).toBe(true);
  });

  it('rejects non-finite input rather than producing NaN downstream', () => {
    expect(() => roundPaise(Number.NaN)).toThrow(MoneyError);
    expect(() => roundPaise(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('rejects amounts beyond the storable maximum', () => {
    expect(() => roundPaise(MAX_AMOUNT_PAISE + 1)).toThrow(/exceeds the maximum/);
  });
});

describe('sumPaise', () => {
  it('adds invoice line items exactly', () => {
    // ₹8,000 rent + ₹910 electricity + ₹200 other + ₹300 late fee = ₹9,410
    expect(sumPaise([800_000, 91_000, 20_000, 30_000])).toBe(941_000);
  });

  it('returns zero for an empty invoice', () => {
    expect(sumPaise([])).toBe(0);
  });

  it('rejects a non-integer line item', () => {
    expect(() => sumPaise([100, 10.5])).toThrow(/amounts\[1\]/);
  });
});

describe('multiplyPaise', () => {
  it('computes an electricity charge from units and rate', () => {
    // 91 units at ₹10.00/unit
    expect(multiplyPaise(1_000, 91)).toBe(91_000);
  });

  it('rounds a fractional unit reading to whole paise', () => {
    // 12.345 units at ₹9.50/unit = 117.2775 -> ₹117.28
    expect(multiplyPaise(950, 12.345)).toBe(11_728);
  });

  it('rejects a negative quantity', () => {
    expect(() => multiplyPaise(950, -1)).toThrow(/must not be negative/);
  });
});

describe('percentOfPaise', () => {
  it('applies a percentage discount', () => {
    expect(percentOfPaise(800_000, 12.5)).toBe(100_000);
  });

  it('rejects a percentage outside 0-100', () => {
    expect(() => percentOfPaise(800_000, 120)).toThrow(MoneyError);
  });
});

describe('allocatePaise', () => {
  it('distributes a remainder so nothing is lost', () => {
    expect(allocatePaise(1_000, [1, 1, 1])).toEqual([334, 333, 333]);
  });

  it('always sums back to the original total', () => {
    const cases: ReadonlyArray<[number, number[]]> = [
      [91_000, [10, 20, 1]],
      [1, [1, 1, 1, 1]],
      [999_999, [3, 3, 3]],
      [12_345, [7, 11, 13, 17]],
      [0, [1, 2]],
    ];
    for (const [total, weights] of cases) {
      expect(sumPaise(allocatePaise(total, weights))).toBe(total);
    }
  });

  it('weights shares by occupied days when splitting a room bill', () => {
    // ₹910 across three tenants who occupied 30, 30 and 10 days.
    expect(allocatePaise(91_000, [30, 30, 10])).toEqual([39_000, 39_000, 13_000]);
  });

  it('gives everything to the only positive weight', () => {
    expect(allocatePaise(500, [0, 3, 0])).toEqual([0, 500, 0]);
  });

  it('breaks ties towards the lower index so results are deterministic', () => {
    expect(allocatePaise(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it('rejects weights that are all zero', () => {
    expect(() => allocatePaise(100, [0, 0])).toThrow(/at least one positive/);
  });

  it('rejects an empty weight list', () => {
    expect(() => allocatePaise(100, [])).toThrow(/must not be empty/);
  });

  it('rejects a negative total', () => {
    expect(() => allocatePaise(-100, [1])).toThrow(/must not be negative/);
  });
});

describe('proratePaise', () => {
  it('returns the exact configured amount for a full period', () => {
    expect(proratePaise(800_000, 31, 31)).toBe(800_000);
  });

  it('pro-rates a tenant joining mid-month', () => {
    // ₹8,000 monthly, joined with 10 of 31 days remaining
    expect(proratePaise(800_000, 10, 31)).toBe(258_065);
  });

  it('returns zero when no days were occupied', () => {
    expect(proratePaise(800_000, 0, 30)).toBe(0);
  });

  it('rejects more occupied days than exist in the period', () => {
    expect(() => proratePaise(800_000, 32, 31)).toThrow(/must not exceed/);
  });

  it('rejects a zero-length period', () => {
    expect(() => proratePaise(800_000, 0, 0)).toThrow(/positive integer/);
  });
});

describe('rupeesToPaise', () => {
  it('parses rupee strings exactly', () => {
    expect(rupeesToPaise('8000')).toBe(800_000);
    expect(rupeesToPaise('8000.50')).toBe(800_050);
    expect(rupeesToPaise('8000.5')).toBe(800_050);
    expect(rupeesToPaise('0.01')).toBe(1);
    expect(rupeesToPaise('-250.75')).toBe(-25_075);
  });

  it('accepts whole-rupee numbers', () => {
    expect(rupeesToPaise(8000)).toBe(800_000);
  });

  it('rejects a value already corrupted by float arithmetic', () => {
    expect(() => rupeesToPaise(0.1 + 0.2)).toThrow(MoneyError);
  });

  it('rejects sub-paise precision', () => {
    expect(() => rupeesToPaise('10.005')).toThrow(MoneyError);
  });

  it('rejects non-numeric input', () => {
    expect(() => rupeesToPaise('eight thousand')).toThrow(MoneyError);
  });
});

describe('paiseToRupeeString', () => {
  it('pads paise to two digits', () => {
    expect(paiseToRupeeString(800_050)).toBe('8000.50');
    expect(paiseToRupeeString(5)).toBe('0.05');
    expect(paiseToRupeeString(0)).toBe('0.00');
    expect(paiseToRupeeString(-25_075)).toBe('-250.75');
  });

  it('round-trips with rupeesToPaise', () => {
    for (const paise of [0, 1, 99, 100, 800_050, 12_345_678]) {
      expect(rupeesToPaise(paiseToRupeeString(paise))).toBe(paise);
    }
  });
});

describe('formatINR', () => {
  // Intl separates symbol from digits with a non-breaking space, and the exact
  // character varies by locale and ICU build — normalise all whitespace.
  const normalise = (value: string) => value.replace(/\s/g, ' ');

  it('uses Indian digit grouping', () => {
    expect(normalise(formatINR(12_000_000))).toContain('1,20,000.00');
  });

  it('can omit paise for dense tables', () => {
    expect(normalise(formatINR(800_000, { withPaise: false, withSymbol: false }))).toBe('8,000');
  });
});
