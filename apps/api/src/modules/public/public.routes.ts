import { slugSchema, type ApiSuccess } from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { getValidated, validate } from '../../middleware/validate.js';
import type { PublicPropertyDetail, PublicPropertySummary } from './public.mapper.js';
import { getPublicProperties, getPublicProperty } from './public.service.js';

/**
 * Unauthenticated guest endpoints.
 *
 * No route here reads an actor, and none may ever return tenant, staff, payment
 * or occupancy-history data. See docs/0004-authorization.md.
 */
export const publicRouter: Router = Router();

const propertyParamsSchema = { params: z.object({ slug: slugSchema }) } as const;

publicRouter.get('/properties', (_req: Request, res: Response, next: NextFunction) => {
  getPublicProperties()
    .then((properties) => {
      const body: ApiSuccess<PublicPropertySummary[]> = { success: true, data: properties };
      res.status(200).json(body);
    })
    .catch(next);
});

publicRouter.get(
  '/properties/:slug',
  validate(propertyParamsSchema),
  (req: Request, res: Response, next: NextFunction) => {
    const { params } = getValidated<typeof propertyParamsSchema>(req);

    getPublicProperty(params.slug)
      .then((property) => {
        const body: ApiSuccess<PublicPropertyDetail> = { success: true, data: property };
        res.status(200).json(body);
      })
      .catch(next);
  },
);
