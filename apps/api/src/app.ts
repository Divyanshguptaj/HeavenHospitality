import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env, isProduction, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { generalLimiter, publicLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { publicRouter } from './modules/public/public.routes.js';

const API_PREFIX = '/api/v1';

function buildCorsOptions(): CorsOptions {
  const allowlist = new Set(env.CORS_ALLOWED_ORIGINS);

  return {
    origin(origin, callback) {
      // A missing Origin header is a same-origin or non-browser client (the
      // mobile app, curl, a health checker) — there is nothing to authorise.
      //
      // A disallowed origin resolves with `false`, not an Error: rejecting simply
      // omits the CORS headers and the browser blocks the response, which is the
      // correct outcome. Passing an Error would route every blocked preflight
      // through the error handler as a 500 INTERNAL_ERROR logged at error level —
      // turning routine browser behaviour into fake server alarms.
      callback(null, origin === undefined || allowlist.has(origin));
    },
    // Required by the two cookie-bearing auth endpoints; see
    // docs/0003-auth-and-sessions.md.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  };
}

export function createApp(): Express {
  const app = express();

  // Behind exactly one reverse proxy in production. Without this, every client IP
  // reads as the proxy's and rate limiting becomes meaningless; set too broadly,
  // a client could spoof X-Forwarded-For and evade it entirely.
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');

  // requestId runs FIRST, before anything that can fail. The error envelope
  // requires a requestId, so a failure inside helmet or cors must already have
  // one — otherwise the response violates its own schema and clients cannot
  // parse it.
  app.use(requestId);
  app.use(helmet());
  app.use(cors(buildCorsOptions()));

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Reuse the id the middleware already assigned, so a log line and the
        // response header always agree. `req.id` is pino's own field and is not
        // set by our middleware.
        genReqId: (req) => (req as unknown as { requestId: string }).requestId,
        autoLogging: {
          // Health checks would otherwise dominate the log volume.
          ignore: (req) => req.url?.startsWith(`${API_PREFIX}/health`) ?? false,
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Payment webhooks mount HERE, before the JSON parser.
  //
  // Signature verification hashes the exact bytes the provider sent. Once
  // express.json() has parsed and re-serialised the body those bytes differ and
  // every signature check fails — which presents, misleadingly, as "the provider
  // is sending invalid signatures". See docs/0007-payments.md.
  //
  //   app.use(
  //     `${API_PREFIX}/payments/webhooks`,
  //     express.raw({ type: 'application/json' }),
  //     webhookRouter,
  //   );
  // ---------------------------------------------------------------------------

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  // Only the two auth endpoints read cookies; every other route is Bearer-only.
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false, limit: env.JSON_BODY_LIMIT }));

  app.use(`${API_PREFIX}/health`, healthRouter);

  // Guest endpoints are unauthenticated, so they carry a tighter limit than
  // authenticated traffic: there is no account to hold accountable and scraping
  // is the expected abuse.
  app.use(`${API_PREFIX}/public`, publicLimiter, publicRouter);

  app.use(API_PREFIX, generalLimiter);

  // Authentication. Mounted before the authenticated domain routers because it is
  // how a client obtains the token they all require.
  app.use(`${API_PREFIX}/auth`, authRouter);

  // Authenticated domain routers mount here as their vertical slices land.

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
