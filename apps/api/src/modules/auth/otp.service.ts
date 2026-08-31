import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { OTP_CODE_LENGTH, maskIndianPhone, type OtpPurposeName } from '@heaven/contracts';
import { env, isProduction } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { getOtpProvider } from './otp.provider.js';

/**
 * One-time codes: issuing them, and deciding whether one is still good.
 *
 * Every rule that makes an OTP meaningful lives here rather than in the route:
 * a code expires, survives only a bounded number of guesses, works exactly once,
 * and cannot be re-requested in a tight loop. A caller that forgot one of those
 * would still be safe, because none of them are the caller's job.
 */

/** Codes and tokens are compared by hash, never by string equality on the plaintext. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `===` on a hash leaks, through timing, how many leading characters matched.
 * With only a million possible codes that is worth closing.
 */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * `randomInt` (CSPRNG), not `Math.random`. A predictable code is not a code —
 * an attacker who can guess the next one never needs to see the SMS.
 */
function generateCode(): string {
  if (!isProduction && env.OTP_DEV_FIXED_CODE !== undefined) {
    return env.OTP_DEV_FIXED_CODE;
  }
  const max = 10 ** OTP_CODE_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_CODE_LENGTH, '0');
}

export interface OtpRequestResult {
  readonly phone: string;
  readonly maskedPhone: string;
  readonly expiresInSeconds: number;
  readonly resendAvailableInSeconds: number;
  /**
   * Present only outside production, so the mobile app can prefill the code in
   * development. `respondWithDevCode` below is what decides whether it is sent.
   */
  readonly devCode?: string;
}

const otpTtlMs = () => env.OTP_TTL_MINUTES * 60_000;
const verificationTtlMs = () => env.OTP_VERIFICATION_TTL_MINUTES * 60_000;

/**
 * Issues a code for `phone`.
 *
 * Any earlier unconsumed code for the same phone and purpose is invalidated
 * first: two live codes would double an attacker's guessing budget, and a user
 * who requested a new code should not find the old one still working.
 */
export async function requestOtp(params: {
  phone: string;
  purpose: OtpPurposeName;
}): Promise<OtpRequestResult> {
  const { phone, purpose } = params;

  const latest = await prisma.otpVerification.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: 'desc' },
  });

  // Resend cooldown. Enforced from the stored row rather than an in-memory
  // counter so it survives a restart and cannot be evaded by rotating IPs.
  if (latest !== null) {
    const elapsedMs = Date.now() - latest.createdAt.getTime();
    const cooldownMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1_000;

    if (elapsedMs < cooldownMs) {
      throw new AppError(
        'OTP_RESEND_TOO_SOON',
        `Please wait ${Math.ceil((cooldownMs - elapsedMs) / 1_000)} seconds before requesting another code.`,
        { context: { phone, purpose } },
      );
    }
  }

  const code = generateCode();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Retire every live code for this phone/purpose before issuing the new one.
    await tx.otpVerification.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: now },
    });

    await tx.otpVerification.create({
      data: {
        phone,
        purpose,
        codeHash: sha256(code),
        expiresAt: new Date(now.getTime() + otpTtlMs()),
      },
    });
  });

  // Delivery failure must not leave the user believing a code is coming.
  await getOtpProvider().sendOtp(phone, code);

  logger.info({ phone: maskIndianPhone(phone), purpose }, 'One-time code issued');

  return {
    phone,
    maskedPhone: maskIndianPhone(phone),
    expiresInSeconds: Math.floor(otpTtlMs() / 1_000),
    resendAvailableInSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    ...(isProduction ? {} : { devCode: code }),
  };
}

export interface OtpVerifyResult {
  readonly phone: string;
  /** Proof for the next step. Opaque to the client; only its hash is stored. */
  readonly verificationToken: string;
  readonly expiresInSeconds: number;
}

/**
 * Checks a code and, on success, issues a short-lived verification token.
 *
 * The token is what the *next* request presents. Without it, "set my password"
 * would only require knowing a phone number — the code would have proved
 * nothing beyond that one request.
 */
export async function verifyOtp(params: {
  phone: string;
  code: string;
  purpose: OtpPurposeName;
}): Promise<OtpVerifyResult> {
  const { phone, code, purpose } = params;

  const record = await prisma.otpVerification.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (record === null) {
    throw new AppError('OTP_INVALID', 'That code is not valid. Please request a new one.');
  }

  if (record.expiresAt <= new Date()) {
    throw new AppError('OTP_EXPIRED', 'That code has expired. Please request a new one.');
  }

  // The attempt is recorded BEFORE the comparison, so a client that disconnects
  // mid-request still spends its guess. Otherwise the limit is trivially evaded.
  const attempts = record.attempts + 1;
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { attempts },
  });

  if (!hashesMatch(record.codeHash, sha256(code))) {
    if (attempts >= env.OTP_MAX_ATTEMPTS) {
      // Burn the code: an attacker gets a fixed budget per code, not per minute.
      await prisma.otpVerification.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      logger.warn(
        { phone: maskIndianPhone(phone), purpose, attempts },
        'One-time code exhausted its attempt limit',
      );
      throw new AppError(
        'OTP_MAX_ATTEMPTS',
        'Too many incorrect attempts. Please request a new code.',
      );
    }

    throw new AppError('OTP_INVALID', 'That code is not correct. Please try again.');
  }

  const verificationToken = randomBytes(32).toString('base64url');

  // Consumed at the moment it succeeds: a correct code cannot be replayed, and
  // the same row now carries the verification token so the two can never drift.
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: {
      consumedAt: new Date(),
      verificationTokenHash: sha256(verificationToken),
      verificationExpiresAt: new Date(Date.now() + verificationTtlMs()),
    },
  });

  logger.info({ phone: maskIndianPhone(phone), purpose }, 'Phone number verified');

  return {
    phone,
    verificationToken,
    expiresInSeconds: Math.floor(verificationTtlMs() / 1_000),
  };
}

/**
 * Redeems a verification token, or throws.
 *
 * Single-use: the token is cleared as it is consumed, so one verification buys
 * exactly one password set. The phone and purpose must both match the row the
 * token was issued against, so a SIGNUP token cannot reset an existing
 * account's password.
 */
export async function consumeVerificationToken(params: {
  phone: string;
  token: string;
  purpose: OtpPurposeName;
}): Promise<void> {
  const { phone, token, purpose } = params;

  const record = await prisma.otpVerification.findUnique({
    where: { verificationTokenHash: sha256(token) },
  });

  const invalid = () =>
    new AppError('PHONE_NOT_VERIFIED', 'This number has not been verified. Please start again.', {
      context: { phone, purpose },
    });

  if (
    record === null ||
    record.phone !== phone ||
    record.purpose !== purpose ||
    record.verificationExpiresAt === null
  ) {
    throw invalid();
  }

  if (record.verificationExpiresAt <= new Date()) {
    throw new AppError('OTP_EXPIRED', 'Your verification has expired. Please start again.');
  }

  // Clearing the hash is what makes it one-use; `updateMany` with the hash in
  // the WHERE clause means two concurrent redemptions cannot both succeed.
  const redeemed = await prisma.otpVerification.updateMany({
    where: { id: record.id, verificationTokenHash: sha256(token) },
    data: { verificationTokenHash: null, verificationExpiresAt: null },
  });

  if (redeemed.count === 0) throw invalid();
}
