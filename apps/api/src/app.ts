import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env, isProduction, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './modules/health/health.routes.js';

const API_PREFIX = '/api/v1';

function buildCorsOptions(): CorsOptions {
  const allowlist = new Set(env.CORS_ALLOWED_ORIGINS);

  return {
    origin(origin, callback) {
      // A missing Origin header is a same-origin or non-browser client (the
      // mobile app, curl, a health checker) — there is nothing to authorise.
      if (origin === undefined || allowlist.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
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

  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(requestId);

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.id ?? '',
        customProps: (req) => ({ requestId: (req as { requestId?: string }).requestId }),
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
  app.use(express.urlencoded({ extended: false, limit: env.JSON_BODY_LIMIT }));

  app.use(`${API_PREFIX}/health`, healthRouter);

  app.use(API_PREFIX, generalLimiter);
  // Domain routers mount here as their vertical slices land.

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
