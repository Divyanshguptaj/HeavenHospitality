import {
  createComplaintSchema,
  idSchema,
  markAbsenceSchema,
  startOnlinePaymentSchema,
  type ApiSuccess,
} from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { getActor, requireAuth, requirePermission } from '../../middleware/authenticate.js';
import { getValidated, validate } from '../../middleware/validate.js';
import {
  createComplaint,
  getComplaintForResident,
  listComplaintsForResident,
} from '../complaints/complaints.service.js';
import { getAbsencesForResident, markAbsence } from '../mess/mess.service.js';
import {
  confirmOnlinePayment,
  getReceipt,
  startOnlinePayment,
} from '../payments/payments.service.js';
import { getActiveTenancyForActor } from '../property/property.context.js';
import {
  getResidentHome,
  getResidentInvoice,
  getResidentPaymentDetails,
  listResidentElectricity,
  listResidentInvoices,
  listResidentPayments,
} from './resident.service.js';

/**
 * Resident API — everything a signed-in resident can see about their OWN stay.
 *
 * No route here accepts a tenancy or user id. The subject is always resolved
 * from the access token, so there is no parameter for one resident to change in
 * order to read another's data.
 */
export const residentRouter: Router = Router();

residentRouter.use(requireAuth(), requirePermission('self:read'));

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

const idParam = { params: z.object({ id: idSchema }) } as const;

residentRouter.get(
  '/home',
  handle((req) => getResidentHome(getActor(req))),
);
residentRouter.get(
  '/invoices',
  handle((req) => listResidentInvoices(getActor(req))),
);

residentRouter.get(
  '/invoices/:id',
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getResidentInvoice(getActor(req), params.id);
  }),
);

residentRouter.get(
  '/payments',
  handle((req) => listResidentPayments(getActor(req))),
);
residentRouter.get(
  '/payment-details',
  handle((req) => getResidentPaymentDetails(getActor(req))),
);
residentRouter.get(
  '/electricity',
  handle((req) => listResidentElectricity(getActor(req))),
);

residentRouter.get(
  '/receipts/:id',
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    const { tenancyId } = await getActiveTenancyForActor(getActor(req));
    // Scoped to the caller's tenancy: another resident's receipt id is a 404.
    return getReceipt(params.id, { tenancyId });
  }),
);

// --- Mock online payment ----------------------------------------------------

residentRouter.post(
  '/payments/start',
  requirePermission('self:write'),
  validate({ body: startOnlinePaymentSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof startOnlinePaymentSchema }>(req);
    // The amount is computed server-side from the invoice; the client never
    // supplies it. See docs/0007-payments.md.
    return startOnlinePayment(getActor(req), body.invoiceId);
  }),
);

const confirmSchema = {
  body: z.object({
    invoiceId: idSchema,
    orderId: z.string().trim().min(1).max(120),
    mockToken: z.string().trim().min(1).max(200),
  }),
} as const;

residentRouter.post(
  '/payments/confirm',
  requirePermission('self:write'),
  validate(confirmSchema),
  handle((req) => {
    const { body } = getValidated<typeof confirmSchema>(req);
    return confirmOnlinePayment(getActor(req), body);
  }),
);

// --- Mess -------------------------------------------------------------------

const absenceQuery = {
  query: z.object({
    from: z.string().trim().max(10),
    to: z.string().trim().max(10),
  }),
} as const;

residentRouter.get(
  '/absences',
  validate(absenceQuery),
  handle((req) => {
    const { query } = getValidated<typeof absenceQuery>(req);
    return getAbsencesForResident(getActor(req), query.from, query.to);
  }),
);

residentRouter.post(
  '/absences',
  requirePermission('self:write'),
  validate({ body: markAbsenceSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof markAbsenceSchema }>(req);
    return markAbsence(getActor(req), body);
  }),
);

// --- Complaints -------------------------------------------------------------

residentRouter.get(
  '/complaints',
  handle((req) => listComplaintsForResident(getActor(req))),
);

residentRouter.get(
  '/complaints/:id',
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getComplaintForResident(getActor(req), params.id);
  }),
);

residentRouter.post(
  '/complaints',
  requirePermission('self:write'),
  validate({ body: createComplaintSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createComplaintSchema }>(req);
    return createComplaint(getActor(req), body);
  }),
);
