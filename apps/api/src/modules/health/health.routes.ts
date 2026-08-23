import type { ApiSuccess } from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { isDatabaseReachable } from '../../lib/prisma.js';

interface LivenessPayload {
  readonly status: 'ok';
  readonly environment: string;
  readonly uptimeSeconds: number;
}

interface ReadinessPayload {
  readonly status: 'ready';
  readonly database: 'up';
}

export const healthRouter: Router = Router();

/**
 * Liveness — is the process running? Deliberately does not touch the database, so
 * a database blip (or a Neon cold start) cannot cause an orchestrator to kill an
 * otherwise healthy process.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  const body: ApiSuccess<LivenessPayload> = {
    success: true,
    data: {
      status: 'ok',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
  res.status(200).json(body);
});

/**
 * Readiness — can this instance actually serve traffic?
 *
 * A degraded result is a 503 carrying an *error* envelope, not a success envelope
 * with a sad payload. Clients branch on `response.ok` before reading the body, so
 * a 503 with `success: true` is unreachable by every consumer we have — the caller
 * would report a generic parse failure instead of "the database is down".
 *
 * Orchestrators still get the 503 they need; clients get a code they can render.
 */
healthRouter.get('/ready', async (_req: Request, res: Response, next: NextFunction) => {
  if (!(await isDatabaseReachable())) {
    next(
      new AppError('SERVICE_DEGRADED', 'The database is unreachable.', {
        context: { database: 'down' },
      }),
    );
    return;
  }

  const body: ApiSuccess<ReadinessPayload> = {
    success: true,
    data: { status: 'ready', database: 'up' },
  };
  res.status(200).json(body);
});
