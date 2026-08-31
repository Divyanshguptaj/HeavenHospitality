import { z } from 'zod';

import { normalizeIndianPhone } from './phone.js';

/**
 * The auth wire contract.
 *
 * These schemas live in `contracts` rather than in the API so the mobile app and
 * the admin console validate against the *same* rules the server enforces. The
 * client copy exists to give fast, kind feedback; the server copy is the one
 * that decides. They cannot drift, because there is only one.
 */

export const OTP_PURPOSES = ['SIGNUP', 'PASSWORD_RESET'] as const;
export type OtpPurposeName = (typeof OTP_PURPOSES)[number];

export const OTP_CODE_LENGTH = 6;

/**
 * Accepts anything a person might type and emits E.164.
 *
 * Normalising inside the schema (rather than in each handler) means no code path
 * can accidentally query with the raw input — by the time a value has a type, it
 * has been normalised.
 */
export const phoneNumberSchema = z
  .string()
  .trim()
  .min(1, 'Enter your mobile number')
  .max(20, 'That does not look like a mobile number')
  .transform((value, ctx) => {
    const normalized = normalizeIndianPhone(value);
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid 10-digit Indian mobile number',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`), `Enter the ${OTP_CODE_LENGTH}-digit code`);

/**
 * Password rules, kept deliberately modest: length is what actually resists
 * guessing, and baroque character classes mostly push people toward
 * `Password1!` and a sticky note. Eight characters with a letter and a digit.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use 128 characters or fewer')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const requestOtpSchema = z.object({
  phone: phoneNumberSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneNumberSchema,
  code: otpCodeSchema,
});

/**
 * The final signup step. `verificationToken` is what proves the phone was
 * verified moments ago — without it, knowing a phone number would be enough to
 * create an account on it.
 */
export const setPasswordSchema = z.object({
  phone: phoneNumberSchema,
  verificationToken: z.string().min(1),
  fullName: z.string().trim().min(1, 'Enter your name').max(120),
  password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  phone: phoneNumberSchema,
  verificationToken: z.string().min(1),
  password: passwordSchema,
});

export const loginSchema = z.object({
  phone: phoneNumberSchema,
  // No complexity rules on login: the rules applied when the password was set.
  // Re-validating here would only tell an attacker which passwords are possible.
  password: z.string().min(1, 'Enter your password').max(128),
});
