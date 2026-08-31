/**
 * Phone numbers, normalised once so the database only ever holds one shape.
 *
 * The login identifier is the phone number, so "9876543210", "+919876543210"
 * and "091 98765 43210" must resolve to the SAME account. Storing whatever the
 * user typed would let one person register three times and would make the
 * unique constraint meaningless — so every entry point normalises to E.164
 * before it touches Prisma.
 *
 * India only for now (`+91`), which is why this is a small hand-written
 * function rather than libphonenumber: one country, one rule, no 300kB
 * dependency in the mobile bundle. Adding a second country means replacing
 * this file, not extending it with special cases.
 */

/** Indian mobile numbers are 10 digits and start with 6-9. Landlines are not accepted. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export const E164_INDIA = /^\+91[6-9]\d{9}$/;

/**
 * Reduces any of the formats a person might type to `+919876543210`.
 *
 * Returns null when the input is not a valid Indian mobile number, so callers
 * must decide what to do rather than receiving a silently mangled value.
 */
export function normalizeIndianPhone(input: string): string | null {
  // Keep digits only. A leading "+" carries no information once we know the
  // country, and separators (spaces, hyphens, brackets) are pure decoration.
  const digits = input.replace(/\D/g, '');

  // Longest prefix first: "91" is also a valid start to a 10-digit number, so
  // testing the 12-digit case before the 10-digit one matters.
  const local =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits.length === 10
          ? digits
          : null;

  if (local === null || !INDIAN_MOBILE.test(local)) return null;

  return `+91${local}`;
}

/** True when the value is already stored-form E.164. */
export function isNormalizedPhone(value: string): boolean {
  return E164_INDIA.test(value);
}

/**
 * `+91 98765 43210` — for display only. Never store this; never compare it.
 */
export function formatIndianPhone(e164: string): string {
  if (!isNormalizedPhone(e164)) return e164;
  const local = e164.slice(3);
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

/**
 * Masks all but the last two digits, for messages that must name a number
 * without printing it — "we sent a code to +91 •••••  ••210".
 */
export function maskIndianPhone(e164: string): string {
  if (!isNormalizedPhone(e164)) return '•••';
  return `+91 ••••• •••${e164.slice(-2)}`;
}
