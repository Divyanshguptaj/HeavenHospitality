import type { ApiSuccess } from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { isProduction } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { getActor, requireAuth } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { getValidated, validate } from '../../middleware/validate.js';
import {
  changePassword,
  getUserView,
  login,
  logout,
  refresh,
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

const loginSchema = {
  body: z.object({
    /// Email or phone; the server resolves which without the client saying.
    identifier: z.string().trim().min(3).max(254),
    // Only a length floor is enforced on login — complexity rules belong on
    // password *creation*, and rejecting here would leak policy to an attacker.
    password: z.string().min(1).max(200),
    deviceLabel: z.string().trim().max(80).optional(),
    client: clientSchema,
  }),
} as const;

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { body } = getValidated<typeof loginSchema>(req);

    login({
      identifier: body.identifier,
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
    // Length is the single strongest password rule; composition rules mostly
    // produce predictable substitutions.
    newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
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
