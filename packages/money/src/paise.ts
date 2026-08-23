import { MoneyError } from './errors.js';

/**
 * An amount of Indian currency expressed in whole paise.
 *
 * Every authoritative monetary value in Heaven Hospitality is an integer number
 * of paise. See docs/0002-money.md for why paise-as-integer was chosen over
 * Prisma Decimal.
 *
 * This is a documentation alias rather than a branded type: Prisma returns plain
 * `number` for `Int` columns, and branding would force a cast at every database
 * boundary without preventing the mistakes that actually happen (arithmetic on
 * rupees). Correctness is enforced at runtime by `assertPaise` instead.
 */
export type Paise = number;

export const PAISE_PER_RUPEE = 100;

/**
 * Upper bound for any single stored amount.
 *
 * Money columns are PostgreSQL `integer` (max 2,147,483,647 paise ≈ ₹2.14 crore).
 * We reject anything above ₹1 crore so there is roughly 2× headroom before the
 * column type is at risk, and so an accidental rupees-instead-of-paise value
 * (100× too large) is caught rather than silently stored.
 *
 * Aggregates are safe regardless: PostgreSQL `SUM(integer)` returns `bigint`.
 */
export const MAX_AMOUNT_PAISE = 1_000_000_000;

export function isPaise(value: unknown): value is Paise {
  return (
    typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= MAX_AMOUNT_PAISE
  );
}

export function assertPaise(value: unknown, label = 'amount'): asserts value is Paise {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, received ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of paise, received ${value}`);
  }
  if (Math.abs(value) > MAX_AMOUNT_PAISE) {
    throw new MoneyError(
      `${label} of ${value} paise exceeds the maximum of ${MAX_AMOUNT_PAISE} paise`,
    );
  }
}

/**
 * The single rounding point in the entire application.
 *
 * Uses "half away from zero", the ordinary Indian commercial convention: 0.5
 * rounds to 1 and -0.5 rounds to -1.
 *
 * Floating point note: this is the only place where a non-integer intermediate
 * exists. Callers must round immediately after a single multiply or divide, never
 * accumulate. Our magnitudes (≤ 1e9 paise) sit far below the 2^53 exact-integer
 * limit of a double, so the representation error of one operation is ~1e-7 paise —
 * orders of magnitude too small to move a value across a .5 boundary.
 */
export function roundPaise(value: number, label = 'amount'): Paise {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, received ${String(value)}`);
  }
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  // `-Math.round(0)` produces -0, which is confusing in logs and JSON.
  const normalised = rounded === 0 ? 0 : rounded;
  assertPaise(normalised, label);
  return normalised;
}

export function sumPaise(amounts: readonly Paise[]): Paise {
  let total = 0;
  for (const [index, amount] of amounts.entries()) {
    assertPaise(amount, `amounts[${index}]`);
    total += amount;
  }
  assertPaise(total, 'sum');
  return total;
}

/**
 * Multiply a unit price by a (possibly fractional) quantity — for example
 * electricity units × paise-per-unit — and round the result to whole paise.
 */
export function multiplyPaise(unitPricePaise: Paise, quantity: number, label = 'amount'): Paise {
  assertPaise(unitPricePaise, 'unitPrice');
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw new MoneyError(`quantity must be a finite number, received ${String(quantity)}`);
  }
  if (quantity < 0) {
    throw new MoneyError(`quantity must not be negative, received ${quantity}`);
  }
  return roundPaise(unitPricePaise * quantity, label);
}

/**
 * Apply a percentage (e.g. a 12.5% discount) and round to whole paise.
 */
export function percentOfPaise(amountPaise: Paise, percent: number, label = 'amount'): Paise {
  assertPaise(amountPaise, 'amount');
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new MoneyError(`percent must be a finite number, received ${String(percent)}`);
  }
  if (percent < 0 || percent > 100) {
    throw new MoneyError(`percent must be between 0 and 100, received ${percent}`);
  }
  return roundPaise((amountPaise * percent) / 100, label);
}
