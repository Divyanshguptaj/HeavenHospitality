import {
  addInvoiceItemSchema,
  createExpenseSchema,
  createFloorSchema,
  createInventoryItemSchema,
  createNoticeSchema,
  createReadingSchema,
  createResidentSchema,
  createRoomSchema,
  createStaffSchema,
  exitResidentSchema,
  generateInvoicesSchema,
  idSchema,
  markStaffAttendanceSchema,
  moveResidentSchema,
  recordPaymentSchema,
  updateBedStatusSchema,
  updateFloorSchema,
  updateMealTimingSchema,
  updateMenuSchema,
  updateResidentSchema,
  updateRoomSchema,
  updateSettingsSchema,
  type ApiSuccess,
} from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { getActor, requireAuth, requirePermission } from '../../middleware/authenticate.js';
import { getValidated, validate } from '../../middleware/validate.js';
import {
  addInvoiceItem,
  generateInvoicesForPeriod,
  getInvoice,
  listInvoices,
  setLateFeeWaiver,
} from '../billing/invoice.service.js';
import {
  getComplaintForOwner,
  listComplaintsForOwner,
  updateComplaint,
} from '../complaints/complaints.service.js';
import { getDashboard, getOccupancy } from '../dashboard/dashboard.service.js';
import {
  getLastReadingForRoom,
  listReadings,
  recordReading,
} from '../electricity/electricity.service.js';
import {
  getMealCountsForOwner,
  getMenuForOwner,
  overrideAbsence,
  updateMealTiming,
  updateMenu,
} from '../mess/mess.service.js';
import {
  createExpense,
  createInventoryItem,
  createNotice,
  createStaff,
  deleteExpense,
  deleteInventoryItem,
  deleteNotice,
  listExpenses,
  listInventory,
  listNotices,
  listReminders,
  listStaff,
  markStaffAttendance,
  setStaffActive,
} from '../operations/operations.service.js';
import { getReceipt, listPayments, recordManualPayment } from '../payments/payments.service.js';
import {
  createFloor,
  createRoom,
  deleteFloor,
  deleteRoom,
  getRoom,
  listFloors,
  listRooms,
  updateBedStatus,
  updateFloor,
  updateRoom,
} from '../property/rooms.service.js';
import { getPropertyContext } from '../property/property.context.js';
import {
  createResident,
  exitResident,
  findUserByEmail,
  getResident,
  listResidents,
  moveResident,
  updateResident,
} from '../residents/residents.service.js';
import {
  getSettings,
  updatePropertyProfile,
  updateSettings,
} from '../settings/settings.service.js';

/**
 * Owner API.
 *
 * `requireAuth()` establishes identity for the whole router; each route then
 * declares the permission it needs. Both are coarse gates — every service also
 * re-checks property scope, so a route that forgot its guard would still fail.
 * See docs/0004-authorization.md.
 */
export const ownerRouter: Router = Router();

ownerRouter.use(requireAuth());

/** Wraps an async handler so a rejection reaches the error middleware. */
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

// --- Dashboard and occupancy ------------------------------------------------

ownerRouter.get(
  '/dashboard',
  requirePermission('property:read'),
  handle((req) => getDashboard(getActor(req))),
);
ownerRouter.get(
  '/occupancy',
  requirePermission('property:read'),
  handle((req) => getOccupancy(getActor(req))),
);

// --- Settings ---------------------------------------------------------------

ownerRouter.get(
  '/settings',
  requirePermission('settings:read'),
  handle((req) => getSettings(getActor(req))),
);

ownerRouter.patch(
  '/settings',
  requirePermission('settings:write'),
  validate({ body: updateSettingsSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof updateSettingsSchema }>(req);
    return updateSettings(getActor(req), body);
  }),
);

const propertyProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  addressLine: z.string().trim().min(3).max(200).optional(),
  locality: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Must be a 6-digit pincode')
    .optional(),
  contactPhone: z.string().trim().min(6).max(20).optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  isPubliclyListed: z.boolean().optional(),
});

ownerRouter.patch(
  '/property',
  requirePermission('settings:write'),
  validate({ body: propertyProfileSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof propertyProfileSchema }>(req);
    return updatePropertyProfile(getActor(req), body);
  }),
);

// --- Floors -----------------------------------------------------------------

ownerRouter.get(
  '/floors',
  requirePermission('property:read'),
  handle((req) => listFloors(getActor(req))),
);

ownerRouter.post(
  '/floors',
  requirePermission('floor:manage'),
  validate({ body: createFloorSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createFloorSchema }>(req);
    return createFloor(getActor(req), body);
  }),
);

ownerRouter.patch(
  '/floors/:id',
  requirePermission('floor:manage'),
  validate({ ...idParam, body: updateFloorSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof updateFloorSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return updateFloor(getActor(req), params.id, body);
  }),
);

ownerRouter.delete(
  '/floors/:id',
  requirePermission('floor:manage'),
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    await deleteFloor(getActor(req), params.id);
    return { deleted: true };
  }),
);

// --- Rooms and beds ---------------------------------------------------------

const roomQuery = { query: z.object({ floorId: idSchema.optional() }) } as const;

ownerRouter.get(
  '/rooms',
  requirePermission('property:read'),
  validate(roomQuery),
  handle((req) => {
    const { query } = getValidated<typeof roomQuery>(req);
    return listRooms(getActor(req), query.floorId === undefined ? {} : { floorId: query.floorId });
  }),
);

ownerRouter.get(
  '/rooms/:id',
  requirePermission('property:read'),
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getRoom(getActor(req), params.id);
  }),
);

ownerRouter.post(
  '/rooms',
  requirePermission('room:manage'),
  validate({ body: createRoomSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createRoomSchema }>(req);
    return createRoom(getActor(req), body);
  }),
);

ownerRouter.patch(
  '/rooms/:id',
  requirePermission('room:manage'),
  validate({ ...idParam, body: updateRoomSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof updateRoomSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return updateRoom(getActor(req), params.id, body);
  }),
);

ownerRouter.delete(
  '/rooms/:id',
  requirePermission('room:manage'),
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    await deleteRoom(getActor(req), params.id);
    return { deleted: true };
  }),
);

ownerRouter.patch(
  '/beds/:id/status',
  requirePermission('bed:manage'),
  validate({ ...idParam, body: updateBedStatusSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof updateBedStatusSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return updateBedStatus(getActor(req), params.id, body.status);
  }),
);

// --- Residents --------------------------------------------------------------

const residentQuery = {
  query: z.object({
    status: z.enum(['ACTIVE', 'NOTICE_PERIOD', 'VACATED']).optional(),
    search: z.string().trim().max(80).optional(),
  }),
} as const;

ownerRouter.get(
  '/residents',
  requirePermission('resident:read'),
  validate(residentQuery),
  handle((req) => {
    const { query } = getValidated<typeof residentQuery>(req);
    return listResidents(getActor(req), query);
  }),
);

const lookupQuery = { query: z.object({ email: z.string().trim().email() }) } as const;

ownerRouter.get(
  '/residents/lookup',
  requirePermission('resident:read'),
  validate(lookupQuery),
  handle((req) => {
    const { query } = getValidated<typeof lookupQuery>(req);
    return findUserByEmail(getActor(req), query.email);
  }),
);

ownerRouter.get(
  '/residents/:id',
  requirePermission('resident:read'),
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getResident(getActor(req), params.id);
  }),
);

ownerRouter.post(
  '/residents',
  requirePermission('resident:write'),
  validate({ body: createResidentSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createResidentSchema }>(req);
    return createResident(getActor(req), body);
  }),
);

ownerRouter.patch(
  '/residents/:id',
  requirePermission('resident:write'),
  validate({ ...idParam, body: updateResidentSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof updateResidentSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return updateResident(getActor(req), params.id, body);
  }),
);

ownerRouter.post(
  '/residents/:id/move',
  requirePermission('bed:manage'),
  validate({ ...idParam, body: moveResidentSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof moveResidentSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return moveResident(getActor(req), params.id, body);
  }),
);

ownerRouter.post(
  '/residents/:id/exit',
  requirePermission('resident:write'),
  validate({ ...idParam, body: exitResidentSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof exitResidentSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return exitResident(getActor(req), params.id, body);
  }),
);

// --- Billing ----------------------------------------------------------------

const invoiceQuery = {
  query: z.object({
    periodKey: z.string().trim().max(7).optional(),
    status: z.string().trim().max(20).optional(),
    search: z.string().trim().max(80).optional(),
  }),
} as const;

ownerRouter.get(
  '/invoices',
  requirePermission('invoice:read'),
  validate(invoiceQuery),
  handle((req) => {
    const { query } = getValidated<typeof invoiceQuery>(req);
    return listInvoices(getActor(req), query);
  }),
);

ownerRouter.get(
  '/invoices/:id',
  requirePermission('invoice:read'),
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getInvoice(getActor(req), params.id);
  }),
);

ownerRouter.post(
  '/invoices/generate',
  requirePermission('invoice:write'),
  validate({ body: generateInvoicesSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof generateInvoicesSchema }>(req);
    return generateInvoicesForPeriod(getActor(req), body.periodKey);
  }),
);

ownerRouter.post(
  '/invoices/:id/items',
  requirePermission('invoice:write'),
  validate({ ...idParam, body: addInvoiceItemSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof addInvoiceItemSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return addInvoiceItem(getActor(req), params.id, body);
  }),
);

const waiverSchema = { body: z.object({ waived: z.boolean() }) } as const;

ownerRouter.post(
  '/invoices/:id/late-fee-waiver',
  requirePermission('invoice:write'),
  validate({ ...idParam, ...waiverSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: (typeof waiverSchema)['body'];
      params: (typeof idParam)['params'];
    }>(req);
    return setLateFeeWaiver(getActor(req), params.id, body.waived);
  }),
);

// --- Payments and receipts --------------------------------------------------

const paymentQuery = { query: z.object({ search: z.string().trim().max(80).optional() }) } as const;

ownerRouter.get(
  '/payments',
  requirePermission('payment:read'),
  validate(paymentQuery),
  handle((req) => {
    const { query } = getValidated<typeof paymentQuery>(req);
    return listPayments(getActor(req), query);
  }),
);

ownerRouter.post(
  '/payments',
  requirePermission('payment:record'),
  validate({ body: recordPaymentSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof recordPaymentSchema }>(req);
    const idempotencyKey = req.get('idempotency-key');
    return recordManualPayment(getActor(req), {
      ...body,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    });
  }),
);

ownerRouter.get(
  '/receipts/:id',
  requirePermission('payment:read'),
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    const { propertyId } = await getPropertyContext(getActor(req), 'payment:read');
    return getReceipt(params.id, { propertyId });
  }),
);

// --- Electricity ------------------------------------------------------------

const readingQuery = {
  query: z.object({
    periodKey: z.string().trim().max(7).optional(),
    roomId: idSchema.optional(),
  }),
} as const;

ownerRouter.get(
  '/electricity',
  requirePermission('electricity:read'),
  validate(readingQuery),
  handle((req) => {
    const { query } = getValidated<typeof readingQuery>(req);
    return listReadings(getActor(req), query);
  }),
);

ownerRouter.get(
  '/electricity/last/:id',
  requirePermission('electricity:read'),
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getLastReadingForRoom(getActor(req), params.id);
  }),
);

ownerRouter.post(
  '/electricity',
  requirePermission('electricity:write'),
  validate({ body: createReadingSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createReadingSchema }>(req);
    return recordReading(getActor(req), body);
  }),
);

// --- Mess -------------------------------------------------------------------

ownerRouter.get(
  '/mess/menu',
  requirePermission('mess:read'),
  handle((req) => getMenuForOwner(getActor(req))),
);

ownerRouter.put(
  '/mess/menu',
  requirePermission('mess:write'),
  validate({ body: updateMenuSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof updateMenuSchema }>(req);
    return updateMenu(getActor(req), body);
  }),
);

ownerRouter.put(
  '/mess/timings',
  requirePermission('mess:write'),
  validate({ body: updateMealTimingSchema }),
  handle(async (req) => {
    const { body } = getValidated<{ body: typeof updateMealTimingSchema }>(req);
    await updateMealTiming(getActor(req), body);
    return { updated: true };
  }),
);

const mealCountQuery = { query: z.object({ date: z.string().trim().max(10).optional() }) } as const;

ownerRouter.get(
  '/mess/counts',
  requirePermission('mess:read'),
  validate(mealCountQuery),
  handle((req) => {
    const { query } = getValidated<typeof mealCountQuery>(req);
    return getMealCountsForOwner(getActor(req), query.date);
  }),
);

const overrideSchema = {
  body: z.object({
    tenancyId: idSchema,
    date: z.string().trim().max(10),
    absentMeals: z.array(z.enum(['BREAKFAST', 'LUNCH', 'DINNER'])).max(3),
  }),
} as const;

ownerRouter.post(
  '/mess/override',
  requirePermission('mess:write'),
  validate(overrideSchema),
  handle((req) => {
    const { body } = getValidated<typeof overrideSchema>(req);
    return overrideAbsence(getActor(req), body);
  }),
);

// --- Complaints -------------------------------------------------------------

const complaintQuery = {
  query: z.object({
    status: z.string().trim().max(20).optional(),
    category: z.string().trim().max(20).optional(),
  }),
} as const;

ownerRouter.get(
  '/complaints',
  requirePermission('complaint:read'),
  validate(complaintQuery),
  handle((req) => {
    const { query } = getValidated<typeof complaintQuery>(req);
    return listComplaintsForOwner(getActor(req), query);
  }),
);

ownerRouter.get(
  '/complaints/:id',
  requirePermission('complaint:read'),
  validate(idParam),
  handle((req) => {
    const { params } = getValidated<typeof idParam>(req);
    return getComplaintForOwner(getActor(req), params.id);
  }),
);

const complaintUpdateSchema = {
  body: z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    note: z.string().trim().max(1000).optional(),
  }),
} as const;

ownerRouter.patch(
  '/complaints/:id',
  requirePermission('complaint:write'),
  validate({ ...idParam, ...complaintUpdateSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: (typeof complaintUpdateSchema)['body'];
      params: (typeof idParam)['params'];
    }>(req);
    return updateComplaint(getActor(req), params.id, body);
  }),
);

// --- Notices ----------------------------------------------------------------

ownerRouter.get(
  '/notices',
  requirePermission('notice:manage'),
  handle((req) => listNotices(getActor(req))),
);

ownerRouter.post(
  '/notices',
  requirePermission('notice:manage'),
  validate({ body: createNoticeSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createNoticeSchema }>(req);
    return createNotice(getActor(req), body);
  }),
);

ownerRouter.delete(
  '/notices/:id',
  requirePermission('notice:manage'),
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    await deleteNotice(getActor(req), params.id);
    return { deleted: true };
  }),
);

// --- Staff, inventory, expenses, reminders ----------------------------------

ownerRouter.get(
  '/staff',
  requirePermission('staff:manage'),
  handle((req) => listStaff(getActor(req))),
);

ownerRouter.post(
  '/staff',
  requirePermission('staff:manage'),
  validate({ body: createStaffSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createStaffSchema }>(req);
    return createStaff(getActor(req), body);
  }),
);

ownerRouter.post(
  '/staff/:id/attendance',
  requirePermission('staff:manage'),
  validate({ ...idParam, body: markStaffAttendanceSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: typeof markStaffAttendanceSchema;
      params: (typeof idParam)['params'];
    }>(req);
    return markStaffAttendance(getActor(req), params.id, body);
  }),
);

const activeSchema = { body: z.object({ isActive: z.boolean() }) } as const;

ownerRouter.patch(
  '/staff/:id',
  requirePermission('staff:manage'),
  validate({ ...idParam, ...activeSchema }),
  handle((req) => {
    const { body, params } = getValidated<{
      body: (typeof activeSchema)['body'];
      params: (typeof idParam)['params'];
    }>(req);
    return setStaffActive(getActor(req), params.id, body.isActive);
  }),
);

ownerRouter.get(
  '/inventory',
  requirePermission('inventory:manage'),
  handle((req) => listInventory(getActor(req))),
);

ownerRouter.post(
  '/inventory',
  requirePermission('inventory:manage'),
  validate({ body: createInventoryItemSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createInventoryItemSchema }>(req);
    return createInventoryItem(getActor(req), body);
  }),
);

ownerRouter.delete(
  '/inventory/:id',
  requirePermission('inventory:manage'),
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    await deleteInventoryItem(getActor(req), params.id);
    return { deleted: true };
  }),
);

const expenseQuery = {
  query: z.object({ periodKey: z.string().trim().max(7).optional() }),
} as const;

ownerRouter.get(
  '/expenses',
  requirePermission('inventory:manage'),
  validate(expenseQuery),
  handle((req) => {
    const { query } = getValidated<typeof expenseQuery>(req);
    return listExpenses(getActor(req), query.periodKey);
  }),
);

ownerRouter.post(
  '/expenses',
  requirePermission('inventory:manage'),
  validate({ body: createExpenseSchema }),
  handle((req) => {
    const { body } = getValidated<{ body: typeof createExpenseSchema }>(req);
    return createExpense(getActor(req), body);
  }),
);

ownerRouter.delete(
  '/expenses/:id',
  requirePermission('inventory:manage'),
  validate(idParam),
  handle(async (req) => {
    const { params } = getValidated<typeof idParam>(req);
    await deleteExpense(getActor(req), params.id);
    return { deleted: true };
  }),
);

ownerRouter.get(
  '/reminders',
  requirePermission('notification:read'),
  handle((req) => listReminders(getActor(req))),
);
