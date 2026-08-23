import { MoneyError } from './errors.js';
import { assertPaise, PAISE_PER_RUPEE, type Paise } from './paise.js';

const RUPEE_INPUT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Convert a rupee amount to whole paise without ever touching floating point.
 *
 * Accepts a string (preferred — e.g. `"8000.50"` from an admin form or a CSV
 * import) or a number. Numbers are stringified first and then parsed, which means
 * a value that has already been corrupted by float arithmetic — `0.1 + 0.2`
 * becoming `0.30000000000000004` — is rejected loudly instead of being silently
 * rounded into the ledger.
 *
 * API request bodies should carry paise directly; this exists for the human-facing
 * edges (seed data, imports, configuration).
 */
export function rupeesToPaise(rupees: string | number): Paise {
  if (typeof rupees === 'number' && !Number.isFinite(rupees)) {
    throw new MoneyError(`rupees must be a finite number, received ${String(rupees)}`);
  }

  const raw = typeof rupees === 'number' ? String(rupees) : rupees.trim();
  const match = RUPEE_INPUT_PATTERN.exec(raw);
  if (!match) {
    throw new MoneyError(
      `"${raw}" is not a valid rupee amount (expected digits with at most two decimal places)`,
    );
  }

  const [, sign, wholePart = '0', fractionPart = ''] = match;
  const paiseFromWhole = Number(wholePart) * PAISE_PER_RUPEE;
  const paiseFromFraction = Number(fractionPart.padEnd(2, '0') || '0');
  const total = (paiseFromWhole + paiseFromFraction) * (sign === '-' ? -1 : 1);

  assertPaise(total, 'rupee amount');
  return total;
}

/**
 * Render paise as a plain decimal rupee string, e.g. `840050` -> `"8400.50"`.
 * Use this for exports, receipts and anywhere a machine will re-read the value.
 */
export function paiseToRupeeString(paise: Paise): string {
  assertPaise(paise, 'amount');
  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const whole = Math.floor(absolute / PAISE_PER_RUPEE);
  const fraction = absolute % PAISE_PER_RUPEE;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

export interface FormatOptions {
  /** Include the ₹ symbol. Default `true`. */
  readonly withSymbol?: boolean;
  /** Show paise. Default `true`; set `false` for dense tables of whole rupees. */
  readonly withPaise?: boolean;
}

/**
 * Human-readable amount using Indian digit grouping, e.g. `₹1,20,000.00`.
 *
 * Display only — never feed the output of this back into a calculation.
 */
export function formatINR(paise: Paise, options: FormatOptions = {}): string {
  assertPaise(paise, 'amount');
  const { withSymbol = true, withPaise = true } = options;
  const fractionDigits = withPaise ? 2 : 0;

  const formatter = new Intl.NumberFormat('en-IN', {
    style: withSymbol ? 'currency' : 'decimal',
    currency: 'INR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return formatter.format(paise / PAISE_PER_RUPEE);
}
