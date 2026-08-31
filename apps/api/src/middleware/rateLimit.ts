import type { ApiError } from '@heaven/contracts';
import type { Request, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';

import { env, isTest } from '../config/env.js';

const MINUTE_MS = 60_000;

/**
 * Rate limiting uses the default in-memory store deliberately — no Redis.
 *
 * At ~30 concurrent users a single API process is the whole deployment, so an
 * in-memory counter is accurate. It resets on restart, which is precisely why
 * authentication abuse protection *also* persists per-account lockout state in
 * PostgreSQL. See docs/0003-auth-and-sessions.md.
 */
function buildLimiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Limits would otherwise leak between test cases and make suites order-dependent.
    skip: () => isTest,
    handler: (req: Request, res: Response) => {
      const body: ApiError = {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down and try again shortly.',
          requestId: req.requestId,
        },
      };
      res.status(429).json(body);
    },
    ...options,
  });
}

/** Baseline for authenticated API traffic. */
export const generalLimiter = buildLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * MINUTE_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
});

/**
 * Login, password reset and refresh. Far tighter, and counted per IP; the
 * per-account counter in PostgreSQL is the layer an IP rotation cannot evade.
 */
export const authLimiter = buildLimiter({
  windowMs: 15 * MINUTE_MS,
  limit: 10,
  skipSuccessfulRequests: true,
});

/**
 * Sending one-time codes.
 *
 * Tighter than `authLimiter`, and it counts SUCCESSES too — the abuse here is
 * not guessing, it is making us send SMS. Every send costs money and lands on
 * someone's phone, so a caller that succeeds ten times in an hour is the exact
 * pattern worth stopping. The per-phone resend cooldown in the database is the
 * layer that survives an IP rotation; this one bounds the total.
 */
export const otpSendLimiter = buildLimiter({
  windowMs: 60 * MINUTE_MS,
  limit: 10,
});

/**
 * Unauthenticated guest endpoints. Tighter than authenticated traffic because
 * there is no account to hold accountable, and scraping is the expected abuse.
 */
export const publicLimiter = buildLimiter({
  windowMs: 5 * MINUTE_MS,
  limit: 100,
});
