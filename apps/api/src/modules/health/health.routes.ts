import type { ApiSuccess } from '@heaven/contracts';
import { Router, type Request, type Response } from 'express';

import { env } from '../../config/env.js';
import { isDatabaseReachable } from '../../lib/prisma.js';

interface LivenessPayload {
  readonly status: 'ok';
  readonly environment: string;
  readonly uptimeSeconds: number;
}

interface ReadinessPayload {
  readonly status: 'ready' | 'degraded';
  readonly database: 'up' | 'down';
}

export const healthRouter: Router = Router();

/**
 * Liveness — is the process running? Deliberately does not touch the database, so
 * a database blip cannot cause an orchestrator to kill a healthy process.
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

/** Readiness — can this instance actually serve traffic? */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const databaseUp = await isDatabaseReachable();

  const body: ApiSuccess<ReadinessPayload> = {
    success: true,
    data: {
      status: databaseUp ? 'ready' : 'degraded',
      database: databaseUp ? 'up' : 'down',
    },
  };

  res.status(databaseUp ? 200 : 503).json(body);
});
