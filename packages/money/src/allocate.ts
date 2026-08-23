import { MoneyError } from './errors.js';
import { assertPaise, roundPaise, type Paise } from './paise.js';

/**
 * Split an amount across weighted shares without losing or inventing a single paise.
 *
 * Uses the largest-remainder method: every share gets the floor of its exact
 * value, then the leftover paise are handed out one at a time to the shares with
 * the largest fractional parts. Ties break towards the lower index so the result
 * is deterministic.
 *
 * `sum(allocatePaise(total, weights)) === total` always holds — which is the
 * property that matters when splitting a room's electricity bill between the
 * tenants who lived there.
 *
 * @example
 * allocatePaise(1000, [1, 1, 1]) // [334, 333, 333]
 */
export function allocatePaise(total: Paise, weights: readonly number[]): Paise[] {
  assertPaise(total, 'total');
  if (total < 0) {
    throw new MoneyError(`total must not be negative, received ${total}`);
  }
  if (weights.length === 0) {
    throw new MoneyError('weights must not be empty');
  }

  let totalWeight = 0;
  for (const [index, weight] of weights.entries()) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      throw new MoneyError(
        `weights[${index}] must be a non-negative finite number, received ${String(weight)}`,
      );
    }
    totalWeight += weight;
  }
  if (totalWeight <= 0) {
    throw new MoneyError('weights must contain at least one positive value');
  }

  const exactShares = weights.map((weight) => (total * weight) / totalWeight);
  const shares = exactShares.map((share) => Math.floor(share));

  const allocated = shares.reduce((sum, share) => sum + share, 0);
  let remainder = total - allocated;

  const byLargestFraction = exactShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byLargestFraction) {
    if (remainder <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }

  return shares;
}

/**
 * Pro-rate a full-period amount over the days actually occupied.
 *
 * Used when a tenant joins or leaves mid-month. The caller supplies the number of
 * days in the billing period so that month length and the property's timezone are
 * decided by the date layer, not re-derived here.
 */
export function proratePaise(
  fullPeriodPaise: Paise,
  occupiedDays: number,
  daysInPeriod: number,
  label = 'prorated amount',
): Paise {
  assertPaise(fullPeriodPaise, 'fullPeriodAmount');
  if (!Number.isInteger(daysInPeriod) || daysInPeriod <= 0) {
    throw new MoneyError(`daysInPeriod must be a positive integer, received ${daysInPeriod}`);
  }
  if (!Number.isInteger(occupiedDays) || occupiedDays < 0) {
    throw new MoneyError(`occupiedDays must be a non-negative integer, received ${occupiedDays}`);
  }
  if (occupiedDays > daysInPeriod) {
    throw new MoneyError(
      `occupiedDays (${occupiedDays}) must not exceed daysInPeriod (${daysInPeriod})`,
    );
  }

  // Full occupancy must return the exact configured amount, never a rounded
  // approximation of it.
  if (occupiedDays === daysInPeriod) return fullPeriodPaise;

  return roundPaise((fullPeriodPaise * occupiedDays) / daysInPeriod, label);
}
