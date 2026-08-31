import { env, isProduction } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';

/**
 * Delivery of one-time codes.
 *
 * The auth service knows only this interface, so swapping the mock for MSG91,
 * Twilio or a DLT-registered Indian gateway is a change to *this file only* —
 * no business logic moves. That is the entire point of the seam: the rules about
 * expiry, attempts and reuse are ours and must not be re-implemented per vendor.
 */
export interface OtpProvider {
  readonly name: string;
  /**
   * Delivers `code` to `phone`. Rejecting means "not delivered": the caller
   * reports failure rather than pretending a code is on its way.
   */
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * Development delivery: the code goes to the log, not to a phone.
 *
 * Guarded twice — this class refuses to be constructed in production, and the
 * environment schema separately refuses `OTP_PROVIDER=mock` there. One guard is
 * a mistake away from being bypassed; two is a policy.
 */
export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock';

  constructor() {
    if (isProduction) {
      throw new Error(
        'MockOtpProvider must never be used in production — configure a real SMS provider.',
      );
    }
  }

  sendOtp(phone: string, code: string): Promise<void> {
    // The one place a code may be logged, and only because this provider cannot
    // exist in production. Everywhere else, codes are treated like passwords.
    logger.info(
      { phone, code, provider: this.name },
      'DEV ONLY — one-time code issued (no SMS was sent)',
    );
    return Promise.resolve();
  }
}

/**
 * Placeholder for the real gateway.
 *
 * Deliberately throws rather than silently doing nothing: a half-built provider
 * that resolves successfully would let production accept signups whose codes
 * were never delivered.
 */
export class SmsOtpProvider implements OtpProvider {
  readonly name = 'sms';

  sendOtp(_phone: string, _code: string): Promise<void> {
    // Rejected, not thrown synchronously: callers await this, and a provider
    // that behaved differently from a real network client would hide bugs.
    return Promise.reject(
      new AppError(
        'PROVIDER_UNAVAILABLE',
        'SMS delivery is not configured yet. Please try again later.',
      ),
    );
  }
}

let cached: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  cached ??= env.OTP_PROVIDER === 'sms' ? new SmsOtpProvider() : new MockOtpProvider();
  return cached;
}

/** Test seam — lets a test observe what would have been sent. */
export function setOtpProviderForTesting(provider: OtpProvider | null): void {
  cached = provider;
}
