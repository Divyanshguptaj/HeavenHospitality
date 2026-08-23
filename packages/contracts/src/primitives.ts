import { MAX_AMOUNT_PAISE } from '@heaven/money';
import { z } from 'zod';

/**
 * Primary keys are UUIDv7: non-guessable (so ids are not an enumeration vector)
 * but time-ordered, which keeps B-tree index locality reasonable in PostgreSQL.
 */
export const idSchema = z.string().uuid();

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Indian mobile numbers, normalised to E.164 for storage.
 *
 * Accepts `9876543210`, `09876543210`, `+91 98765 43210` and similar, and always
 * stores `+919876543210`, so the same person cannot end up with two spellings.
 *
 * Uniqueness is enforced only where a phone number is a *login identity* — never
 * on contact fields, because a parent's number legitimately repeats across
 * tenancies. See docs/0005-billing-rules.md.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => /^(?:\+91|91|0)?[6-9]\d{9}$/.test(value), {
    message: 'Must be a valid Indian mobile number',
  })
  .transform((value) => `+91${value.slice(-10)}`);

/**
 * A monetary amount in whole paise. See docs/0002-money.md.
 *
 * Rejecting non-integers at the API boundary is what keeps `MoneyError` from ever
 * surfacing to a user as a 500.
 */
export const paiseSchema = z
  .number()
  .int('Amount must be a whole number of paise')
  // Both bounds matter. Credits, reversals and adjustments are legitimately
  // negative, so the lower bound cannot be zero — but without it a hugely
  // negative amount passes validation and then throws MoneyError deeper in,
  // surfacing as a 500 instead of a 400.
  .min(-MAX_AMOUNT_PAISE, 'Amount is implausibly large — is this rupees instead of paise?')
  .max(MAX_AMOUNT_PAISE, 'Amount is implausibly large — is this rupees instead of paise?');

export const nonNegativePaiseSchema = paiseSchema.min(0, 'Amount must not be negative');
export const positivePaiseSchema = paiseSchema.min(1, 'Amount must be greater than zero');

/** A business date with no time component, e.g. a due date or a meter reading date. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');

/** A billing period, e.g. "2026-08". The idempotency key for monthly jobs. */
export const periodKeySchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Must be a billing period (YYYY-MM)');

/** URL-safe property identifier used by the public guest experience. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase words separated by hyphens');

export const nonEmptyStringSchema = z.string().trim().min(1);

/**
 * Free-text supplied by users (complaint descriptions, notes). Bounded so a
 * request body cannot be used to bloat the database or a log line.
 */
export const shortTextSchema = z.string().trim().max(500);
export const longTextSchema = z.string().trim().max(5_000);
