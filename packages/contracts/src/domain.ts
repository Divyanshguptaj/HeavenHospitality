import { z } from 'zod';

import { dateOnlySchema, idSchema, nonNegativePaiseSchema, periodKeySchema } from './primitives.js';

/**
 * Domain enums and request/response contracts shared by the API and both
 * clients. Keeping them here is what stops the three from drifting: a field
 * added to a response is a deliberate edit visible to every consumer.
 */

// --- Enums (mirror the Prisma enums exactly) --------------------------------

export const ROOM_STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] as const;
export type RoomStatusName = (typeof ROOM_STATUSES)[number];

export const BED_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'BLOCKED'] as const;
export type BedStatusName = (typeof BED_STATUSES)[number];

export const TENANCY_STATUSES = ['ACTIVE', 'NOTICE_PERIOD', 'VACATED'] as const;
export type TenancyStatusName = (typeof TENANCY_STATUSES)[number];

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;
export type InvoiceStatusName = (typeof INVOICE_STATUSES)[number];

export const INVOICE_ITEM_KINDS = ['RENT', 'ELECTRICITY', 'LATE_FEE', 'OTHER', 'DISCOUNT'] as const;
export type InvoiceItemKindName = (typeof INVOICE_ITEM_KINDS)[number];

export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'ONLINE'] as const;
export type PaymentMethodName = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED'] as const;
export type PaymentStatusName = (typeof PAYMENT_STATUSES)[number];

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
export type MealTypeName = (typeof MEAL_TYPES)[number];

export const COMPLAINT_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'CARPENTER',
  'WIFI',
  'CLEANING',
  'AC',
  'FURNITURE',
  'OTHER',
] as const;
export type ComplaintCategoryName = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type ComplaintStatusName = (typeof COMPLAINT_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'] as const;
export type AttendanceStatusName = (typeof ATTENDANCE_STATUSES)[number];

// --- Human-readable labels, shared so both clients say the same thing --------

export const MEAL_LABELS: Readonly<Record<MealTypeName, string>> = Object.freeze({
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
});

export const COMPLAINT_CATEGORY_LABELS: Readonly<Record<ComplaintCategoryName, string>> =
  Object.freeze({
    PLUMBING: 'Plumbing',
    ELECTRICAL: 'Electrical',
    CARPENTER: 'Carpentry',
    WIFI: 'Wi-Fi',
    CLEANING: 'Cleaning',
    AC: 'Air conditioning',
    FURNITURE: 'Furniture',
    OTHER: 'Other',
  });

export const COMPLAINT_STATUS_LABELS: Readonly<Record<ComplaintStatusName, string>> = Object.freeze(
  {
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  },
);

export const INVOICE_STATUS_LABELS: Readonly<Record<InvoiceStatusName, string>> = Object.freeze({
  DRAFT: 'Draft',
  ISSUED: 'Unpaid',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
});

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethodName, string>> = Object.freeze({
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
});

/** ISO-8601 weekday numbering: 1 = Monday … 7 = Sunday. */
export const DAY_NAMES: Readonly<Record<number, string>> = Object.freeze({
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
});

// --- Settings ---------------------------------------------------------------

/**
 * Owner-configurable financial rules. Every one of these is read from the
 * database at calculation time — none may be hard-coded in business logic.
 */
export const financialSettingsSchema = z.object({
  // 1-28 so the due date exists in February too.
  rentDueDay: z.number().int().min(1).max(28),
  graceDays: z.number().int().min(0).max(31),
  lateFeePerDayPaise: nonNegativePaiseSchema,
  lateFeeCapPaise: nonNegativePaiseSchema,
  electricityRatePaisePerUnit: nonNegativePaiseSchema,
});

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 21:00');

export const paymentSettingsSchema = z.object({
  bankAccountName: z.string().trim().max(120).nullable(),
  bankAccountNumber: z.string().trim().max(34).nullable(),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Not a valid IFSC code')
    .nullable(),
  bankName: z.string().trim().max(120).nullable(),
  upiId: z
    .string()
    .trim()
    .regex(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, 'Not a valid UPI id')
    .nullable(),
  upiQrImageUrl: z.string().trim().url().nullable(),
  paymentDetailsArePublic: z.boolean(),
});

export const messSettingsSchema = z.object({
  mealCutoffLocalTime: timeOfDaySchema,
});

export const updateSettingsSchema = financialSettingsSchema
  .merge(paymentSettingsSchema)
  .merge(messSettingsSchema)
  .partial();

export type FinancialSettings = z.infer<typeof financialSettingsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// --- Floors -----------------------------------------------------------------

export const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.number().int().min(0).max(200),
});

export const updateFloorSchema = createFloorSchema.partial();

// --- Rooms ------------------------------------------------------------------

export const createRoomSchema = z.object({
  floorId: idSchema,
  number: z.string().trim().min(1).max(20),
  roomType: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(12),
  monthlyRentPaise: nonNegativePaiseSchema,
  isAirConditioned: z.boolean().default(false),
  description: z.string().trim().max(500).nullable().optional(),
  facilities: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  status: z.enum(ROOM_STATUSES).default('ACTIVE'),
});

export const updateRoomSchema = createRoomSchema.partial();

// --- Beds -------------------------------------------------------------------

export const updateBedStatusSchema = z.object({
  // OCCUPIED is deliberately absent: occupancy is a consequence of assigning a
  // resident, never something the owner sets by hand.
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'BLOCKED']),
});

export const assignBedSchema = z.object({
  tenancyId: idSchema,
  startedAt: dateOnlySchema.optional(),
  reason: z.string().trim().max(200).optional(),
});

// --- Residents --------------------------------------------------------------

export const createResidentSchema = z.object({
  /// Supplied when assigning an already-registered person.
  existingUserId: idSchema.optional(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(6).max(20).optional(),
  joiningDate: dateOnlySchema,
  expectedExitDate: dateOnlySchema.optional(),
  bedId: idSchema.optional(),
  monthlyRentOverridePaise: nonNegativePaiseSchema.optional(),
  securityDepositPaise: nonNegativePaiseSchema.default(0),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(20).optional(),
});

export const updateResidentSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(20).nullable().optional(),
  expectedExitDate: dateOnlySchema.nullable().optional(),
  monthlyRentOverridePaise: nonNegativePaiseSchema.nullable().optional(),
  securityDepositPaise: nonNegativePaiseSchema.optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(20).nullable().optional(),
  status: z.enum(TENANCY_STATUSES).optional(),
});

export const moveResidentSchema = z.object({
  toBedId: idSchema,
  effectiveFrom: dateOnlySchema.optional(),
  reason: z.string().trim().max(200).optional(),
});

export const exitResidentSchema = z.object({
  actualExitDate: dateOnlySchema,
  reason: z.string().trim().max(200).optional(),
});

// --- Electricity ------------------------------------------------------------

export const createReadingSchema = z.object({
  roomId: idSchema,
  periodKey: periodKeySchema,
  previousReading: z.number().int().min(0).max(9_999_999),
  currentReading: z.number().int().min(0).max(9_999_999),
  readingDate: dateOnlySchema,
  notes: z.string().trim().max(300).optional(),
});

// --- Invoices and payments --------------------------------------------------

export const generateInvoicesSchema = z.object({
  periodKey: periodKeySchema,
});

export const addInvoiceItemSchema = z.object({
  kind: z.enum(['OTHER', 'DISCOUNT']),
  description: z.string().trim().min(1).max(160),
  /// A DISCOUNT is stored as a negative amount; the service enforces the sign.
  amountPaise: z.number().int(),
});

export const recordPaymentSchema = z.object({
  tenancyId: idSchema,
  invoiceId: idSchema.optional(),
  amountPaise: z.number().int().positive(),
  method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER']),
  paidAt: dateOnlySchema,
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const startOnlinePaymentSchema = z.object({
  invoiceId: idSchema,
});

export const confirmOnlinePaymentSchema = z.object({
  orderId: z.string().trim().min(1).max(120),
  /// The mock provider's stand-in for a gateway signature.
  mockToken: z.string().trim().min(1).max(200),
});

// --- Mess -------------------------------------------------------------------

export const updateMenuSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  mealType: z.enum(MEAL_TYPES),
  items: z.array(z.string().trim().min(1).max(80)).max(15),
});

export const updateMealTimingSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  startsAt: timeOfDaySchema,
  endsAt: timeOfDaySchema,
});

export const markAbsenceSchema = z.object({
  date: dateOnlySchema,
  /// Empty array = present for everything that day.
  absentMeals: z.array(z.enum(MEAL_TYPES)).max(3),
});

// --- Complaints -------------------------------------------------------------

export const createComplaintSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  category: z.enum(COMPLAINT_CATEGORIES),
  imageUrl: z.string().trim().url().max(500).optional(),
});

export const updateComplaintSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  note: z.string().trim().max(1000).optional(),
});

// --- Notices, staff, inventory, expenses -----------------------------------

export const createNoticeSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  startsOn: dateOnlySchema,
  endsOn: dateOnlySchema.optional(),
  isPinned: z.boolean().default(false),
});

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  role: z.string().trim().min(2).max(60),
  phone: z.string().trim().max(20).optional(),
  monthlySalaryPaise: nonNegativePaiseSchema.optional(),
  joinedOn: dateOnlySchema,
});

export const markStaffAttendanceSchema = z.object({
  date: dateOnlySchema,
  status: z.enum(ATTENDANCE_STATUSES),
});

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  quantity: z.number().int().min(0).max(100_000),
  unitCostPaise: nonNegativePaiseSchema.optional(),
  purchasedOn: dateOnlySchema.optional(),
  notes: z.string().trim().max(300).optional(),
});

export const createExpenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  amountPaise: z.number().int().positive(),
  spentOn: dateOnlySchema,
  notes: z.string().trim().max(300).optional(),
});
