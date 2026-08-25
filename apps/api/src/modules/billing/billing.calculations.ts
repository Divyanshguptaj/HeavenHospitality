import { allocatePaise, proratePaise, roundPaise, type Paise } from '@heaven/money';

import {
  addDays,
  compareDates,
  daysBetween,
  daysInMonth,
  occupiedDaysInPeriod,
  parsePeriodKey,
  type DateOnly,
  type PeriodKey,
} from '../../lib/dates.js';

/**
 * Pure billing arithmetic.
 *
 * Deliberately free of Prisma and of `new Date()`: every input is passed in, so
 * every rule is testable without a database and without freezing the clock.
 * Nothing here reads configuration — the caller supplies the owner's settings,
 * which is what keeps rates out of business logic (spec §10, §11).
 */

// --- Rent -------------------------------------------------------------------

export interface RentCalculation {
  readonly amountPaise: Paise;
  readonly occupiedDays: number;
  readonly daysInPeriod: number;
  readonly isProrated: boolean;
}

/**
 * Rent for one resident for one billing period.
 *
 * Pro-rated when the stay does not cover the whole month — a resident who joins
 * on the 20th pays for the days they were actually there, not a full month.
 * A full month returns the configured rent exactly, never a rounded
 * approximation of it.
 */
export function calculateRent(params: {
  periodKey: PeriodKey;
  monthlyRentPaise: Paise;
  joiningDate: DateOnly;
  exitDate: DateOnly | null;
}): RentCalculation {
  const { year, month } = parsePeriodKey(params.periodKey);
  const totalDays = daysInMonth(year, month);

  const occupiedDays = occupiedDaysInPeriod(params.periodKey, params.joiningDate, params.exitDate);

  return {
    amountPaise: proratePaise(params.monthlyRentPaise, occupiedDays, totalDays, 'rent'),
    occupiedDays,
    daysInPeriod: totalDays,
    isProrated: occupiedDays !== totalDays,
  };
}

// --- Late fee ---------------------------------------------------------------

export interface LateFeeInput {
  readonly dueDate: DateOnly;
  readonly graceDays: number;
  readonly perDayPaise: Paise;
  readonly capPaise: Paise;
  /** Today, in the property's timezone. */
  readonly asOf: DateOnly;
  /** The date the invoice was fully settled, if it has been. */
  readonly settledOn: DateOnly | null;
  /** True when the owner has waived the fee for this invoice. */
  readonly isWaived: boolean;
  /** Principal still outstanding. No principal outstanding means no fee. */
  readonly outstandingPaise: Paise;
}

export interface LateFeeResult {
  readonly amountPaise: Paise;
  readonly overdueDays: number;
  readonly isCapped: boolean;
}

/**
 * The late fee for an invoice, as a PURE FUNCTION of its inputs.
 *
 * This is the design decision that makes the nightly job idempotent: the fee is
 * recomputed and upserted onto a single invoice line rather than accrued by
 * appending a row each night. Running the job zero, one or fifty times converges
 * on the same number, and a missed night self-heals on the next run instead of
 * under-charging forever.
 *
 * Rules:
 *   - Nothing accrues until `dueDate + graceDays` has passed.
 *   - Accrual stops on the day the invoice was settled, not "today" — paying
 *     late must not keep costing more afterwards.
 *   - A fully-paid invoice accrues nothing.
 *   - The cap is absolute. Uncapped daily accrual against someone who has left
 *     produces balances nobody will ever collect, each needing a manual waiver.
 */
export function calculateLateFee(input: LateFeeInput): LateFeeResult {
  const none: LateFeeResult = { amountPaise: 0, overdueDays: 0, isCapped: false };

  if (input.isWaived) return none;
  if (input.outstandingPaise <= 0 && input.settledOn === null) return none;
  if (input.perDayPaise <= 0) return none;

  const chargeableFrom = addDays(input.dueDate, input.graceDays);

  // Accrual is measured to the settlement date when settled, otherwise to today.
  const measureTo = input.settledOn ?? input.asOf;
  if (compareDates(measureTo, chargeableFrom) <= 0) return none;

  const overdueDays = daysBetween(chargeableFrom, measureTo);
  if (overdueDays <= 0) return none;

  const uncapped = roundPaise(overdueDays * input.perDayPaise, 'late fee');
  const amountPaise = Math.min(uncapped, input.capPaise);

  return { amountPaise, overdueDays, isCapped: amountPaise < uncapped };
}

// --- Electricity ------------------------------------------------------------

export interface ElectricityCalculation {
  readonly units: number;
  readonly amountPaise: Paise;
}

/**
 * A room's electricity for a month.
 *
 * `units = current − previous`, `amount = units × rate`, rounded once. The rate
 * is passed in and then SNAPSHOT onto the reading by the caller, so changing the
 * setting later never rewrites an issued bill (spec §11).
 */
export function calculateElectricity(params: {
  previousReading: number;
  currentReading: number;
  ratePaisePerUnit: Paise;
}): ElectricityCalculation {
  if (params.currentReading < params.previousReading) {
    // Guarded here as well as by a CHECK constraint: a meter running backwards
    // is a data-entry error or a meter replacement, never a negative bill.
    throw new Error('Current reading cannot be lower than the previous reading');
  }

  const units = params.currentReading - params.previousReading;
  return {
    units,
    amountPaise: roundPaise(units * params.ratePaisePerUnit, 'electricity'),
  };
}

export interface ElectricityShareInput {
  readonly tenancyId: string;
  readonly startedOn: DateOnly;
  readonly endedOn: DateOnly | null;
}

export interface ElectricityShareResult {
  readonly tenancyId: string;
  readonly sharePaise: Paise;
  readonly occupiedDays: number;
}

/**
 * Splits a room's electricity across the residents who occupied it.
 *
 * Weighted by occupied days (spec §11): someone who moved in on the 25th pays
 * for six days of the room's consumption, not a third of the month. When
 * everyone was there the whole period the weights are equal and the split is
 * equal — so "equal split" is the natural special case rather than a separate
 * code path.
 *
 * `allocatePaise` guarantees the shares sum to the bill exactly, so no paise is
 * created or destroyed by rounding.
 */
export function splitElectricity(
  amountPaise: Paise,
  periodKey: PeriodKey,
  occupants: readonly ElectricityShareInput[],
): readonly ElectricityShareResult[] {
  if (occupants.length === 0) return [];

  const weights = occupants.map((occupant) =>
    occupiedDaysInPeriod(periodKey, occupant.startedOn, occupant.endedOn),
  );

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  // Nobody actually occupied the room during the period: there is no fair way to
  // apportion the bill, so it stays unallocated for the owner to handle.
  if (totalWeight === 0) {
    return occupants.map((occupant) => ({
      tenancyId: occupant.tenancyId,
      sharePaise: 0,
      occupiedDays: 0,
    }));
  }

  const shares = allocatePaise(amountPaise, weights);

  return occupants.map((occupant, index) => ({
    tenancyId: occupant.tenancyId,
    sharePaise: shares[index] ?? 0,
    occupiedDays: weights[index] ?? 0,
  }));
}

// --- Payment application ----------------------------------------------------

export interface PayableInvoice {
  readonly invoiceId: string;
  readonly dueDate: DateOnly;
  readonly outstandingPaise: Paise;
}

export interface PaymentApplication {
  readonly invoiceId: string;
  readonly amountPaise: Paise;
}

export interface PaymentApplicationResult {
  readonly applications: readonly PaymentApplication[];
  /** Left over after every invoice is settled — becomes resident credit. */
  readonly unallocatedPaise: Paise;
}

/**
 * Applies a payment across outstanding invoices, oldest due date first.
 *
 * Oldest-first is what stops an old debt sitting unpaid while later invoices are
 * settled — which would keep accruing late fees on the oldest one forever.
 *
 * Anything left over is returned as unallocated rather than being forced onto an
 * invoice: overpayments and advances are real, and they need somewhere to live.
 */
export function applyPaymentToInvoices(
  amountPaise: Paise,
  invoices: readonly PayableInvoice[],
): PaymentApplicationResult {
  const ordered = [...invoices]
    .filter((invoice) => invoice.outstandingPaise > 0)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.invoiceId.localeCompare(b.invoiceId));

  const applications: PaymentApplication[] = [];
  let remaining = amountPaise;

  for (const invoice of ordered) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, invoice.outstandingPaise);
    applications.push({ invoiceId: invoice.invoiceId, amountPaise: applied });
    remaining -= applied;
  }

  return { applications, unallocatedPaise: remaining };
}

// --- Invoice status ---------------------------------------------------------

export type DerivedInvoiceStatus = 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'ISSUED';

/**
 * An invoice's status is DERIVED from its numbers and the date, never set by
 * hand — which is what stops the list showing "unpaid" for something that has
 * been paid in full.
 */
export function deriveInvoiceStatus(params: {
  totalPaise: Paise;
  amountPaidPaise: Paise;
  dueDate: DateOnly;
  asOf: DateOnly;
}): DerivedInvoiceStatus {
  if (params.amountPaidPaise >= params.totalPaise) return 'PAID';

  const isOverdue = compareDates(params.asOf, params.dueDate) > 0;
  if (params.amountPaidPaise > 0) return isOverdue ? 'OVERDUE' : 'PARTIALLY_PAID';

  return isOverdue ? 'OVERDUE' : 'ISSUED';
}
