/**
 * Business dates.
 *
 * Every business rule — rent due dates, late-fee accrual, mess cutoffs, meal
 * counts — runs in the *property's* timezone, never the server's and never the
 * device's. A server in UTC deciding that "today" is the 5th when it is still
 * the 4th in Pune would issue invoices a day early, every month.
 *
 * Business dates are handled as `YYYY-MM-DD` strings rather than `Date` objects:
 * a `Date` always carries a time and a zone, and that is exactly what causes
 * off-by-one-day bugs. They are converted to `Date` only at the Prisma boundary,
 * where the column is `@db.Date`.
 *
 * Implemented with `Intl` rather than a date library — it is built in, correct,
 * and this module is small enough to test exhaustively.
 */

export type DateOnly = string;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function partsInZone(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // en-CA formats as YYYY-MM-DD, which is exactly what we want.
  const [y, m, d] = formatter.format(instant).split('-').map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

/** Today, as seen in the property's timezone. */
export function todayInZone(timeZone: string, now: Date = new Date()): DateOnly {
  const { y, m, d } = partsInZone(now, timeZone);
  return toDateOnly(y, m, d);
}

export function toDateOnly(year: number, month: number, day: number): DateOnly {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isDateOnly(value: string): boolean {
  return DATE_PATTERN.test(value);
}

export function splitDateOnly(date: DateOnly): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid business date: ${date}`);
  }
  return { year, month, day };
}

/**
 * Converts to the `Date` Prisma stores in a `@db.Date` column.
 *
 * Anchored at UTC midnight deliberately: PostgreSQL `date` has no time or zone,
 * and using local midnight would shift the stored day for anyone east or west
 * of the server.
 */
export function toPrismaDate(date: DateOnly): Date {
  const { year, month, day } = splitDateOnly(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Reads a `@db.Date` value back without letting the local zone shift the day. */
export function fromPrismaDate(value: Date): DateOnly {
  return toDateOnly(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

// --- Billing periods --------------------------------------------------------

/** "2026-09" — the unit of work for monthly billing and meter readings. */
export type PeriodKey = string;

export function periodKeyOf(date: DateOnly): PeriodKey {
  const { year, month } = splitDateOnly(date);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function currentPeriodKey(timeZone: string, now: Date = new Date()): PeriodKey {
  return periodKeyOf(todayInZone(timeZone, now));
}

export function parsePeriodKey(periodKey: PeriodKey): { year: number; month: number } {
  const [year, month] = periodKey.split('-').map(Number);
  if (year === undefined || month === undefined || month < 1 || month > 12) {
    throw new Error(`Invalid period key: ${periodKey}`);
  }
  return { year, month };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function firstDayOfPeriod(periodKey: PeriodKey): DateOnly {
  const { year, month } = parsePeriodKey(periodKey);
  return toDateOnly(year, month, 1);
}

export function lastDayOfPeriod(periodKey: PeriodKey): DateOnly {
  const { year, month } = parsePeriodKey(periodKey);
  return toDateOnly(year, month, daysInMonth(year, month));
}

/**
 * The due date for a period, given the owner-configured day of month.
 *
 * `rentDueDay` is capped at 28 by validation so this never has to clamp, but the
 * clamp stays as a defence against a bad value reaching here another way.
 */
export function dueDateFor(periodKey: PeriodKey, rentDueDay: number): DateOnly {
  const { year, month } = parsePeriodKey(periodKey);
  const day = Math.min(Math.max(rentDueDay, 1), daysInMonth(year, month));
  return toDateOnly(year, month, day);
}

// --- Arithmetic -------------------------------------------------------------

export function addDays(date: DateOnly, days: number): DateOnly {
  const base = toPrismaDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return fromPrismaDate(base);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((toPrismaDate(to).getTime() - toPrismaDate(from).getTime()) / MS_PER_DAY);
}

export function compareDates(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: DateOnly, b: DateOnly): DateOnly {
  return a <= b ? a : b;
}

export function maxDate(a: DateOnly, b: DateOnly): DateOnly {
  return a >= b ? a : b;
}

/**
 * Days a stay overlapped a billing period, inclusive of both endpoints.
 *
 * This is what makes a resident who joins on the 20th pay for 11 days rather
 * than a whole month, and what weights their share of the room's electricity.
 * Returns 0 when the ranges do not overlap at all.
 */
export function occupiedDaysInPeriod(
  periodKey: PeriodKey,
  startedOn: DateOnly,
  endedOn: DateOnly | null,
): number {
  const periodStart = firstDayOfPeriod(periodKey);
  const periodEnd = lastDayOfPeriod(periodKey);

  const from = maxDate(periodStart, startedOn);
  const to = endedOn === null ? periodEnd : minDate(periodEnd, endedOn);

  if (compareDates(from, to) > 0) return 0;
  return daysBetween(from, to) + 1;
}

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: DateOnly): number {
  const day = toPrismaDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Indian financial year label for a date, e.g. "2026-27". The year runs
 * 1 April – 31 March, which is what receipt numbering is grouped by.
 */
export function fiscalYearOf(date: DateOnly): string {
  const { year, month } = splitDateOnly(date);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Local time-of-day "HH:MM" in the property's zone, for cutoff comparisons. */
export function localTimeInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}
