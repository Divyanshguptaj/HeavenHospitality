import {
  loginSchema as sharedLoginSchema,
  passwordSchema,
  requestOtpSchema,
  resetPasswordSchema,
  setPasswordSchema,
  verifyOtpSchema,
  type ApiSuccess,
} from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { isProduction } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { getActor, requireAuth } from '../../middleware/authenticate.js';
import { authLimiter, otpSendLimiter } from '../../middleware/rateLimit.js';
import { getValidated, validate } from '../../middleware/validate.js';
import {
  changePassword,
  completeSignup,
  getUserView,
  login,
  logout,
  refresh,
  resetPassword,
  startPasswordReset,
  startSignup,
  verifyPasswordResetOtp,
  verifySignupOtp,
  type AuthResult,
  type AuthenticatedUserView,
} from './auth.service.js';
import { REFRESH_TOKEN_SECONDS } from './tokens.js';

export const authRouter: Router = Router();

const REFRESH_COOKIE = 'heaven_refresh';

/**
 * Web clients receive the refresh token as an httpOnly cookie; mobile receives it
 * in the body and stores it in the OS keystore.
 *
 * The API itself stays uniformly Bearer-based — the cookie exists on these two
 * routes only. A refresh token in `localStorage` is readable by any XSS and worth
 * 30 days of access from the attacker's own machine; in an httpOnly cookie script
 * cannot read it at all. See docs/0003-auth-and-sessions.md.
 */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_SECONDS * 1_000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

interface SessionPayload {
  readonly user: AuthenticatedUserView;
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  /** Present for mobile only; web reads its refresh token from the cookie. */
  readonly refreshToken?: string;
}

/**
 * `client=mobile` opts into the body-delivered refresh token. Anything else is
 * treated as a browser and gets the cookie, so a browser can never be talked into
 * exposing its refresh token to script.
 */
function respondWithSession(res: Response, result: AuthResult, client: string | undefined): void {
  const isMobile = client === 'mobile';

  if (!isMobile) setRefreshCookie(res, result.refreshToken);

  const body: ApiSuccess<SessionPayload> = {
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      expiresInSeconds: result.accessTokenExpiresInSeconds,
      ...(isMobile ? { refreshToken: result.refreshToken } : {}),
    },
  };

  res.status(200).json(body);
}

const clientSchema = z.enum(['web', 'mobile']).optional();

const loginBodySchema = {
  body: sharedLoginSchema.extend({
    deviceLabel: z.string().trim().max(80).optional(),
    client: clientSchema,
  }),
} as const;

authRouter.post(
  '/login',
  authLimiter,
  validate(loginBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof loginBodySchema>(req);

    login({
      phone: body.phone,
      password: body.password,
      deviceLabel: body.deviceLabel,
      ipAddress: req.ip,
    })
      .then((result) => {
        respondWithSession(res, result, body.client);
      })
      .catch(next);
  },
);

// ---------------------------------------------------------------------------
// Signup: request a code, verify it, then choose a password.
//
// Split into three routes rather than one because each step has a different
// precondition, and collapsing them would mean an account could exist before
// its phone number was proven.
// ---------------------------------------------------------------------------

const requestOtpBodySchema = { body: requestOtpSchema } as const;
const verifyOtpBodySchema = { body: verifyOtpSchema } as const;

authRouter.post(
  '/signup/request-otp',
  otpSendLimiter,
  validate(requestOtpBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof requestOtpBodySchema>(req);

    startSignup(body.phone)
      .then((result) => {
        res.status(200).json({ success: true, data: result });
      })
      .catch(next);
  },
);

authRouter.post(
  '/signup/verify-otp',
  authLimiter,
  validate(verifyOtpBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof verifyOtpBodySchema>(req);

    verifySignupOtp(body.phone, body.code)
      .then((result) => {
        res.status(200).json({ success: true, data: result });
      })
      .catch(next);
  },
);

const setPasswordBodySchema = {
  body: setPasswordSchema.extend({ client: clientSchema }),
} as const;

authRouter.post(
  '/signup/set-password',
  authLimiter,
  validate(setPasswordBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof setPasswordBodySchema>(req);

    completeSignup({
      phone: body.phone,
      verificationToken: body.verificationToken,
      fullName: body.fullName,
      password: body.password,
      deviceLabel: body.client === 'mobile' ? 'Mobile app' : 'Web',
      ipAddress: req.ip,
    })
      .then((result) => {
        respondWithSession(res, result, body.client);
      })
      .catch(next);
  },
);

// ---------------------------------------------------------------------------
// Forgot password: the same three steps, against an existing account.
// ---------------------------------------------------------------------------

authRouter.post(
  '/forgot-password/request-otp',
  otpSendLimiter,
  validate(requestOtpBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof requestOtpBodySchema>(req);

    startPasswordReset(body.phone)
      .then((result) => {
        res.status(200).json({ success: true, data: result });
      })
      .catch(next);
  },
);

authRouter.post(
  '/forgot-password/verify-otp',
  authLimiter,
  validate(verifyOtpBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof verifyOtpBodySchema>(req);

    verifyPasswordResetOtp(body.phone, body.code)
      .then((result) => {
        res.status(200).json({ success: true, data: result });
      })
      .catch(next);
  },
);

const resetPasswordBodySchema = { body: resetPasswordSchema } as const;

authRouter.post(
  '/forgot-password/reset',
  authLimiter,
  validate(resetPasswordBodySchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof resetPasswordBodySchema>(req);

    resetPassword({
      phone: body.phone,
      verificationToken: body.verificationToken,
      password: body.password,
    })
      .then(() => {
        // Every session died with the reset, this one included. The client must
        // sign in with the new password, which is the point.
        clearRefreshCookie(res);
        res.status(200).json({ success: true, data: { ok: true } });
      })
      .catch(next);
  },
);

const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(1).optional(),
    client: clientSchema,
  }),
} as const;

authRouter.post(
  '/refresh',
  authLimiter,
  validate(refreshSchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof refreshSchema>(req);
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = body.refreshToken ?? cookies?.[REFRESH_COOKIE];

    if (token === undefined || token === '') {
      next(new AppError('UNAUTHENTICATED', 'No session to refresh.'));
      return;
    }

    refresh({ refreshToken: token, ipAddress: req.ip })
      .then((result) => {
        respondWithSession(res, result, body.client);
      })
      .catch((error: unknown) => {
        // A dead session must not leave a stale cookie behind, or the browser
        // retries with it forever.
        clearRefreshCookie(res);
        next(error);
      });
  },
);

const logoutSchema = { body: z.object({ refreshToken: z.string().min(1).optional() }) } as const;

authRouter.post(
  '/logout',
  validate(logoutSchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof logoutSchema>(req);
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = body.refreshToken ?? cookies?.[REFRESH_COOKIE];

    clearRefreshCookie(res);

    // Logging out is always reported as success, even with no token: telling a
    // caller their token was already invalid is information they do not need.
    if (token === undefined || token === '') {
      res.status(200).json({ success: true, data: { ok: true } });
      return;
    }

    logout(token)
      .then(() => {
        res.status(200).json({ success: true, data: { ok: true } });
      })
      .catch(next);
  },
);

authRouter.get('/me', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  getUserView(getActor(req).userId)
    .then((user) => {
      const body: ApiSuccess<AuthenticatedUserView> = { success: true, data: user };
      res.status(200).json(body);
    })
    .catch(next);
});

const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1).max(200),
    // The same rules signup applies — one definition, so a password that was
    // acceptable at signup cannot be rejected here for a different reason.
    newPassword: passwordSchema,
  }),
} as const;

authRouter.post(
  '/change-password',
  requireAuth(),
  validate(changePasswordSchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof changePasswordSchema>(req);

    changePassword({
      userId: getActor(req).userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    })
      .then(() => {
        // Every session was revoked, including this one — the client must sign in
        // again, which is the point.
        clearRefreshCookie(res);
        res.status(200).json({ success: true, data: { ok: true } });
      })
      .catch(next);
  },
);
