import { z } from 'zod';

import {
  aadhaarNumberSchema,
  dateOnlySchema,
  idSchema,
  nonNegativePaiseSchema,
  periodKeySchema,
  phoneSchema,
} from './primitives.js';

/**
 * Domain enums and request/response contracts shared by the API and both
 * clients. Keeping them here is what stops the three from drifting: a field
 * added to a response is a deliberate edit visible to every consumer.
 */

// --- Enums (mirror the Prisma enums exactly) --------------------------------

/**
 * The icon vocabulary the backend may use for a facility.
 *
 * A closed list, validated on the way in and mapped to a glyph by the client.
 * The database stores a MEANING ("wifi"), never a component or icon-font name —
 * a backend that can name a client symbol is a backend that can decide what the
 * client renders. Anything outside this list degrades to a neutral default.
 */
export const FACILITY_ICON_KEYS = [
  'wifi',
  'meals',
  'laundry',
  'housekeeping',
  'power-backup',
  'security',
  'hot-water',
  'study',
  'ac',
  'parking',
  'water',
  'gym',
  'tv',
  'lift',
] as const;
export type FacilityIconKey = (typeof FACILITY_ICON_KEYS)[number];

export function isFacilityIconKey(value: string | null): value is FacilityIconKey {
  return value !== null && (FACILITY_ICON_KEYS as readonly string[]).includes(value);
}

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

export const INVOICE_ITEM_KINDS = [
  'RENT',
  'ELECTRICITY',
  'LATE_FEE',
  'OTHER',
  'DISCOUNT',
  'DEPOSIT',
] as const;
export type InvoiceItemKindName = (typeof INVOICE_ITEM_KINDS)[number];

/**
 * What an invoice is FOR, distinct from what is on it — a RENT invoice can
 * still carry a LATE_FEE or an ad-hoc OTHER/DISCOUNT item. Rent, electricity
 * and the deposit are each billed on their own invoice, so a resident can
 * settle any one of the three without the other two being touched.
 */
export const INVOICE_CATEGORIES = ['RENT', 'ELECTRICITY', 'DEPOSIT'] as const;
export type InvoiceCategoryName = (typeof INVOICE_CATEGORIES)[number];

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

export const REGISTRATION_DOCUMENT_TYPES = [
  'AADHAAR_CARD',
  'COLLEGE_ID',
  'PASSPORT_PHOTO',
  'OTHER',
] as const;
export type RegistrationDocumentType = (typeof REGISTRATION_DOCUMENT_TYPES)[number];

export const REGISTRATION_DOCUMENT_TYPE_LABELS: Readonly<Record<RegistrationDocumentType, string>> =
  Object.freeze({
    AADHAAR_CARD: 'Aadhaar card',
    COLLEGE_ID: 'College ID',
    PASSPORT_PHOTO: 'Passport photo',
    OTHER: 'Other',
  });

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

export const INVOICE_CATEGORY_LABELS: Readonly<Record<InvoiceCategoryName, string>> = Object.freeze({
  RENT: 'Rent',
  ELECTRICITY: 'AC bill',
  DEPOSIT: 'Security',
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
  /**
   * Two switches, not one. A UPI handle is printed on a counter; an account
   * number with an IFSC is the pair used to impersonate a payment request. An
   * owner routinely wants the first public and the second not, and the public
   * API filters on these at the query — a detail that is not published is never
   * loaded, let alone sent.
   */
  showBankDetailsPublicly: z.boolean(),
  showUpiPublicly: z.boolean(),
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

// --- Public content (facilities, house rules, gallery) ----------------------
//
// The owner's side of what public.ts serves read-only. Each is a simple
// name/description-shaped row with isActive (unpublish without losing the
// content) and sortOrder (the order guests see them in) — same shape as
// Floor's own manage-then-list pattern.

export const createFacilitySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  iconKey: z.enum(FACILITY_ICON_KEYS).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const updateFacilitySchema = createFacilitySchema.partial();

export const createRuleSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(1000),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const updateRuleSchema = createRuleSchema.partial();

export const createPhotoSchema = z.object({
  /// A plain external URL — the development path (see PropertyPhoto in the
  /// schema). Uploading to object storage is a separate, later feature.
  url: z.string().trim().url().max(2000),
  caption: z.string().trim().max(200).optional(),
  isActive: z.boolean().optional(),
});
export const updatePhotoSchema = createPhotoSchema.partial();

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
  /// Required: it is the login identity, so an account without one could never
  /// be signed in to. Email is optional and is not used to sign in.
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email().max(254).optional(),
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
  /// Changeable, but never removable — it is how the person signs in.
  phone: phoneSchema.optional(),
  expectedExitDate: dateOnlySchema.nullable().optional(),
  monthlyRentOverridePaise: nonNegativePaiseSchema.nullable().optional(),
  securityDepositPaise: nonNegativePaiseSchema.optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(20).nullable().optional(),
  status: z.enum(TENANCY_STATUSES).optional(),
});

// --- Registration (the admission form) ---------------------------------------

/**
 * The admission form a resident fills once, themselves. Every field mirrors
 * the paper "Student Registration Form" the property already used, so an
 * admin who has filled it in on paper for years recognises this immediately.
 *
 * Course/semester and vehicle number are the only optional fields — a
 * student between institutes may have no course to give, and plenty of
 * residents have no vehicle at all. Everything else on the paper form was
 * always filled in, so the digital one asks for it too.
 */
/// Aadhaar documents are uploaded as PDFs (Cloudinary serves an uploaded PDF
/// from a URL ending in `.pdf`), so a photo cannot stand in for one.
const pdfUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((url) => /\.pdf(\?.*)?$/i.test(url), 'The Aadhaar document must be a PDF.');

const registrationFieldsSchema = z.object({
  fatherName: z.string().trim().min(1).max(120),
  motherName: z.string().trim().min(1).max(120),
  parentMobile: phoneSchema,
  dateOfBirth: dateOnlySchema,
  aadhaarNumber: aadhaarNumberSchema,
  collegeOrInstitute: z.string().trim().min(1).max(160),
  courseOrSemester: z.string().trim().max(120).optional(),
  permanentAddress: z.string().trim().min(1).max(400),
  bloodGroup: z.string().trim().min(1).max(10),
  parentOccupation: z.string().trim().min(1).max(120),
  vehicleNumber: z.string().trim().max(20).optional(),
  /// Which single document this submission is standing in for — the physical
  /// form's checklist, digitised as a choice rather than a set of checkboxes.
  documentType: z.enum(REGISTRATION_DOCUMENT_TYPES),
  documentOtherDescription: z.string().trim().max(120).optional(),
  /// Uploaded to Cloudinary by the client; this is just the URL it handed back.
  documentImageUrl: pdfUrlSchema,
  /// The parent's Aadhaar, also a PDF.
  parentDocumentUrl: pdfUrlSchema,
  /// The person's own photo, uploaded the same way.
  photoUrl: z.string().trim().url().max(500),
});

export const submitRegistrationSchema = registrationFieldsSchema
  .extend({
    /// The digital equivalent of the signature box: cannot submit without it.
    termsAccepted: z.literal(true),
  })
  .refine((data) => data.documentType !== 'OTHER' || (data.documentOtherDescription ?? '').trim() !== '', {
    message: 'Describe the document you are uploading.',
    path: ['documentOtherDescription'],
  });

/// Same fields, all optional — what an admin may correct afterward. No
/// `termsAccepted`: that is the resident's own act, not something an admin
/// re-attests to on their behalf.
export const updateRegistrationSchema = registrationFieldsSchema.partial();

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

/**
 * The electricity/AC bill, entered directly per resident — no meter reading,
 * no automatic split. The admin decides what each person in the room owes.
 */
export const recordElectricityBillSchema = z.object({
  roomId: idSchema,
  periodKey: periodKeySchema,
  entries: z
    .array(z.object({ tenancyId: idSchema, amountPaise: z.number().int().positive() }))
    .min(1)
    .max(20),
  notes: z.string().trim().max(300).optional(),
});

export const updateElectricityInvoiceSchema = z.object({
  amountPaise: z.number().int().positive(),
});

/// A manual correction to one resident's share of a room's electricity bill —
/// the even/prorated split is a starting point, not the final word.
export const updateElectricityShareSchema = z.object({
  sharePaise: nonNegativePaiseSchema,
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
  // How much of each bill (rent, AC bill, security — any subset) this payment
  // covers. Each amount is checked against what that bill still owes.
  allocations: z
    .array(z.object({ invoiceId: idSchema, amountPaise: z.number().int().positive() }))
    .min(1)
    .max(20),
  method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER']),
  paidAt: dateOnlySchema,
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(300).optional(),
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
