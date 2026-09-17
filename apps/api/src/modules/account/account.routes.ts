import { submitRegistrationSchema, type ApiSuccess } from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { getActor, requireAuth, requireRole } from '../../middleware/authenticate.js';
import { getValidated, validate } from '../../middleware/validate.js';
import { createUploadSignature } from '../uploads/cloudinary.service.js';
import { getRegistration, submitRegistration } from './account.service.js';

/**
 * Account-level API — reachable by NON_RESIDENT as well as RESIDENT, unlike
 * the rest of `/me`. The admission form has to be reachable before a tenancy
 * exists, which rules out both gating this router the way `residentRouter` is
 * (self:read/write, a property-scoped permission) and using `requirePermission`
 * at all: a NON_RESIDENT holds no PropertyMembership for a permission to attach
 * to. `requireRole` checks the account's own role instead, which both have.
 */
export const accountRouter: Router = Router();

accountRouter.use(requireAuth(), requireRole('NON_RESIDENT', 'RESIDENT'));

function handle<T>(
  work: (req: Request) => Promise<T>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    work(req)
      .then((data) => {
        const body: ApiSuccess<T> = { success: true, data };
        res.status(200).json(body);
      })
      .catch(next);
  };
}

accountRouter.get(
  '/registration',
  handle((req) => getRegistration(getActor(req))),
);

accountRouter.post(
  '/registration',
  validate({ body: submitRegistrationSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof submitRegistrationSchema }>(req);
    return submitRegistration(getActor(req), body);
  }),
);

accountRouter.get(
  '/uploads/cloudinary-signature',
  handle(() => Promise.resolve(createUploadSignature())),
);
