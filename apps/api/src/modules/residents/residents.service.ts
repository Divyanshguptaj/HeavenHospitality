import type {
  ApplicantView,
  ResidentDetailView,
  ResidentSummaryView,
  updateRegistrationSchema,
} from '@heaven/contracts';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import {
  addDays,
  dueDateFor,
  fromPrismaDate,
  maxDate,
  periodKeyOf,
  todayInZone,
  toPrismaDate,
  type DateOnly,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { toRegistrationView } from '../account/account.service.js';
import { generateDepositInvoice, recomputeInvoice } from '../billing/invoice.service.js';
import { getPropertyContext } from '../property/property.context.js';
import { deleteCloudinaryAsset } from '../uploads/cloudinary.service.js';

/**
 * Residents.
 *
 * A resident is a User (the person) plus a Tenancy (this stay) plus an
 * Allocation (which bed, from when). Someone who leaves and returns gets a
 * second Tenancy under the same User, so history is never overwritten and a
 * repeat resident is not a duplicate account (spec §26).
 */

const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION
  );
}

const TENANCY_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      fatherName: true,
      motherName: true,
      parentMobile: true,
      dateOfBirth: true,
      aadhaarNumber: true,
      collegeOrInstitute: true,
      courseOrSemester: true,
      permanentAddress: true,
      bloodGroup: true,
      parentOccupation: true,
      vehicleNumber: true,
      documentType: true,
      documentOtherDescription: true,
      documentImageUrl: true,
      photoUrl: true,
      registrationCompletedAt: true,
    },
  },
  allocations: {
    where: { endedAt: null },
    include: {
      bed: {
        select: {
          id: true,
          label: true,
          room: {
            select: {
              id: true,
              number: true,
              monthlyRentPaise: true,
              floor: { select: { name: true } },
            },
          },
        },
      },
    },
  },
  invoices: { select: { totalPaise: true, amountPaidPaise: true, status: true } },
} as const;

type TenancyWithRelations = Prisma.TenancyGetPayload<{ include: typeof TENANCY_INCLUDE }>;

/** Outstanding is derived from invoices, never stored — a stored balance drifts. */
function outstandingOf(tenancy: TenancyWithRelations): number {
  return tenancy.invoices
    .filter((invoice) => invoice.status !== 'CANCELLED')
    .reduce((sum, invoice) => sum + Math.max(0, invoice.totalPaise - invoice.amountPaidPaise), 0);
}

function toSummary(tenancy: TenancyWithRelations): ResidentSummaryView {
  const allocation = tenancy.allocations[0];
  const room = allocation?.bed.room;

  return {
    tenancyId: tenancy.id,
    userId: tenancy.user.id,
    fullName: tenancy.user.fullName,
    email: tenancy.user.email,
    phone: tenancy.user.phone,
    status: tenancy.status,
    joiningDate: fromPrismaDate(tenancy.joiningDate),
    expectedExitDate:
      tenancy.expectedExitDate === null ? null : fromPrismaDate(tenancy.expectedExitDate),
    bed:
      allocation === undefined || room === undefined
        ? null
        : {
            bedId: allocation.bed.id,
            bedLabel: allocation.bed.label,
            roomId: room.id,
            roomNumber: room.number,
            floorName: room.floor.name,
          },
    // A tenancy-level override wins; otherwise the room's rent applies.
    monthlyRentPaise: tenancy.monthlyRentOverridePaise ?? room?.monthlyRentPaise ?? 0,
    outstandingPaise: outstandingOf(tenancy),
  };
}

export async function listResidents(
  actor: Actor,
  filters: Loose<{ status: 'ACTIVE' | 'NOTICE_PERIOD' | 'VACATED'; search: string }> = {},
): Promise<ResidentSummaryView[]> {
  const { propertyId } = await getPropertyContext(actor, 'resident:read');

  const tenancies = await prisma.tenancy.findMany({
    where: {
      propertyId,
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.search === undefined || filters.search === ''
        ? {}
        : {
            user: {
              OR: [
                { fullName: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
                { phone: { contains: filters.search } },
              ],
            },
          }),
    },
    orderBy: [{ status: 'asc' }, { joiningDate: 'desc' }],
    include: TENANCY_INCLUDE,
  });

  return tenancies.map(toSummary);
}

/**
 * Applicants: NON_RESIDENT accounts that have filled the admission form but
 * hold no tenancy yet — invisible to `listResidents` because they have none.
 *
 * Not scoped to a property: a non-resident holds no PropertyMembership (the
 * form is filled before anyone decides where they will live), so there is
 * nothing on the account to filter by. `getPropertyContext` still runs, to
 * authorise the request the same way every other owner endpoint does.
 */
export async function listApplicants(actor: Actor): Promise<ApplicantView[]> {
  await getPropertyContext(actor, 'resident:read');

  const users = await prisma.user.findMany({
    where: { role: 'NON_RESIDENT', registrationCompletedAt: { not: null } },
    orderBy: { registrationCompletedAt: 'desc' },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      fatherName: true,
      motherName: true,
      parentMobile: true,
      dateOfBirth: true,
      aadhaarNumber: true,
      collegeOrInstitute: true,
      courseOrSemester: true,
      permanentAddress: true,
      bloodGroup: true,
      parentOccupation: true,
      vehicleNumber: true,
      documentType: true,
      documentOtherDescription: true,
      documentImageUrl: true,
      photoUrl: true,
      registrationCompletedAt: true,
    },
  });

  return users.map((user) => ({
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    registration: toRegistrationView(user),
  }));
}

export async function getResident(actor: Actor, tenancyId: string): Promise<ResidentDetailView> {
  const { propertyId } = await getPropertyContext(actor, 'resident:read');

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId },
    include: {
      ...TENANCY_INCLUDE,
      invoices: {
        orderBy: { periodKey: 'desc' },
        select: {
          id: true,
          number: true,
          periodKey: true,
          category: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalPaise: true,
          amountPaidPaise: true,
        },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        include: { receipts: { select: { number: true } } },
      },
      electricityShares: {
        orderBy: { createdAt: 'desc' },
        include: {
          reading: {
            select: {
              periodKey: true,
              units: true,
              ratePaisePerUnit: true,
              room: { select: { number: true } },
            },
          },
        },
      },
    },
  });

  if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');

  const complaints = await prisma.complaint.findMany({
    where: { propertyId, raisedByUserId: tenancy.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const allocation = tenancy.allocations[0];
  const room = allocation?.bed.room;
  const summary = toSummary(tenancy);

  return {
    ...summary,
    outstandingPaise: tenancy.invoices
      .filter((invoice) => invoice.status !== 'CANCELLED')
      .reduce((sum, i) => sum + Math.max(0, i.totalPaise - i.amountPaidPaise), 0),
    securityDepositPaise: tenancy.securityDepositPaise,
    monthlyRentOverridePaise: tenancy.monthlyRentOverridePaise,
    emergencyContactName: tenancy.emergencyContactName,
    emergencyContactPhone: tenancy.emergencyContactPhone,
    actualExitDate: tenancy.actualExitDate === null ? null : fromPrismaDate(tenancy.actualExitDate),
    invoices: tenancy.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      periodKey: invoice.periodKey,
      category: invoice.category,
      status: invoice.status,
      issueDate: fromPrismaDate(invoice.issueDate),
      dueDate: fromPrismaDate(invoice.dueDate),
      totalPaise: invoice.totalPaise,
      amountPaidPaise: invoice.amountPaidPaise,
      outstandingPaise: Math.max(0, invoice.totalPaise - invoice.amountPaidPaise),
      residentName: tenancy.user.fullName,
      roomNumber: room?.number ?? null,
      tenancyId: tenancy.id,
    })),
    payments: tenancy.payments.map((payment) => ({
      id: payment.id,
      amountPaise: payment.amountPaise,
      method: payment.method,
      status: payment.status,
      reference: payment.reference,
      notes: payment.notes,
      paidAt: payment.paidAt === null ? null : payment.paidAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      residentName: tenancy.user.fullName,
      tenancyId: tenancy.id,
      receiptNumber: payment.receipts[0]?.number ?? null,
      unallocatedPaise: payment.unallocatedPaise,
    })),
    electricity: tenancy.electricityShares.map((share) => ({
      id: share.id,
      periodKey: share.reading.periodKey,
      units: share.reading.units,
      ratePaisePerUnit: share.reading.ratePaisePerUnit,
      sharePaise: share.sharePaise,
      occupiedDays: share.occupiedDays,
      roomNumber: share.reading.room.number,
    })),
    complaints: complaints.map((complaint) => ({
      id: complaint.id,
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      status: complaint.status,
      createdAt: complaint.createdAt.toISOString(),
      residentName: tenancy.user.fullName,
      roomNumber: room?.number ?? null,
    })),
    registration: toRegistrationView(tenancy.user),
  };
}

async function applyRegistrationEdits(
  userId: string,
  input: z.infer<typeof updateRegistrationSchema>,
): Promise<ResidentDetailView['registration']> {
  // Only fetched when a photo itself is changing — every other edit never
  // touches Cloudinary, so it never pays for this read.
  const previous =
    input.documentImageUrl === undefined && input.photoUrl === undefined
      ? null
      : await prisma.user.findUnique({
          where: { id: userId },
          select: { documentImageUrl: true, photoUrl: true },
        });

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fatherName === undefined ? {} : { fatherName: input.fatherName }),
      ...(input.motherName === undefined ? {} : { motherName: input.motherName }),
      ...(input.parentMobile === undefined ? {} : { parentMobile: input.parentMobile }),
      ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: toPrismaDate(input.dateOfBirth) }),
      ...(input.aadhaarNumber === undefined ? {} : { aadhaarNumber: input.aadhaarNumber }),
      ...(input.collegeOrInstitute === undefined ? {} : { collegeOrInstitute: input.collegeOrInstitute }),
      ...(input.courseOrSemester === undefined ? {} : { courseOrSemester: input.courseOrSemester }),
      ...(input.permanentAddress === undefined ? {} : { permanentAddress: input.permanentAddress }),
      ...(input.bloodGroup === undefined ? {} : { bloodGroup: input.bloodGroup }),
      ...(input.parentOccupation === undefined ? {} : { parentOccupation: input.parentOccupation }),
      ...(input.vehicleNumber === undefined ? {} : { vehicleNumber: input.vehicleNumber }),
      ...(input.documentType === undefined ? {} : { documentType: input.documentType }),
      ...(input.documentOtherDescription === undefined
        ? {}
        : { documentOtherDescription: input.documentOtherDescription }),
      ...(input.documentImageUrl === undefined ? {} : { documentImageUrl: input.documentImageUrl }),
      ...(input.photoUrl === undefined ? {} : { photoUrl: input.photoUrl }),
    },
  });

  // Replaced, not appended to — an old photo is no longer reachable from
  // anywhere in the app, so it should not go on sitting in Cloudinary either.
  if (previous !== null) {
    const replaced = [
      previous.documentImageUrl !== input.documentImageUrl && input.documentImageUrl !== undefined
        ? previous.documentImageUrl
        : null,
      previous.photoUrl !== input.photoUrl && input.photoUrl !== undefined ? previous.photoUrl : null,
    ];
    for (const oldUrl of replaced) {
      if (oldUrl !== null) await deleteCloudinaryAsset(oldUrl);
    }
  }

  return toRegistrationView(user);
}

/** Admin correction of a resident's own admission form, after they have submitted it once. */
export async function updateRegistration(
  actor: Actor,
  tenancyId: string,
  input: z.infer<typeof updateRegistrationSchema>,
): Promise<ResidentDetailView['registration']> {
  const { propertyId } = await getPropertyContext(actor, 'resident:write');

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId },
    select: { userId: true },
  });
  if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');

  return applyRegistrationEdits(tenancy.userId, input);
}

/**
 * Admin correction of an applicant's admission form — the same edit as
 * `updateRegistration`, but reached by user id rather than a tenancy, since an
 * applicant has none yet.
 */
export async function updateApplicantRegistration(
  actor: Actor,
  userId: string,
  input: z.infer<typeof updateRegistrationSchema>,
): Promise<ResidentDetailView['registration']> {
  await getPropertyContext(actor, 'resident:write');

  const applicant = await prisma.user.findFirst({
    where: { id: userId, role: 'NON_RESIDENT', registrationCompletedAt: { not: null } },
    select: { id: true },
  });
  if (applicant === null) throw new AppError('NOT_FOUND', 'Applicant not found.');

  return applyRegistrationEdits(applicant.id, input);
}

/** Owner-facing lookup so an existing person is reused instead of duplicated. */
export async function findUserByEmail(
  actor: Actor,
  email: string,
): Promise<{
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hasActiveTenancy: boolean;
} | null> {
  const { propertyId } = await getPropertyContext(actor, 'resident:read');

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      tenancies: {
        where: { propertyId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
        select: { id: true },
      },
    },
  });

  if (user === null) return null;

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    hasActiveTenancy: user.tenancies.length > 0,
  };
}

/**
 * Owner-facing lookup by phone — the identity a resident actually signs up
 * with (spec: mobile number + password). This is what finds someone who
 * registered themselves through the app, before they have ever been a
 * resident: their account exists, but has no email on file to search by.
 *
 * Reports the active tenancy's bed status too, not just whether one exists:
 * an applicant just promoted to resident (spec §7's "assign a bed
 * afterward from Rooms") already has an active tenancy with no bed, and that
 * is exactly who a room's "add resident" search needs to be able to place —
 * a plain boolean could not tell that case apart from someone genuinely
 * already living elsewhere.
 */
export async function findUserByPhone(
  actor: Actor,
  phone: string,
): Promise<{
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  activeTenancyId: string | null;
  hasBed: boolean;
} | null> {
  const { propertyId } = await getPropertyContext(actor, 'resident:read');

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      tenancies: {
        where: { propertyId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
        select: { id: true, allocations: { where: { endedAt: null }, select: { id: true } } },
        take: 1,
      },
    },
  });

  if (user === null) return null;

  const tenancy = user.tenancies[0];

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    activeTenancyId: tenancy?.id ?? null,
    hasBed: (tenancy?.allocations.length ?? 0) > 0,
  };
}

/**
 * Opens an allocation, letting the DATABASE decide whether the bed was free.
 *
 * Two owners assigning the same bed at the same instant both pass any
 * "is it available?" read, because there is always a gap between the check and
 * the write. The partial unique index has no such gap: the second insert fails,
 * and that failure becomes BED_ALREADY_ALLOCATED. Checking first would be a
 * race; this is not.
 */
async function openAllocation(
  tx: TransactionClient,
  params: { tenancyId: string; bedId: string; startedAt: DateOnly; reason?: string | undefined },
): Promise<void> {
  try {
    await tx.allocation.create({
      data: {
        tenancyId: params.tenancyId,
        bedId: params.bedId,
        startedAt: toPrismaDate(params.startedAt),
        reason: params.reason ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        'BED_ALREADY_ALLOCATED',
        'That bed has just been taken. Please pick another one.',
      );
    }
    throw error;
  }

  await tx.bed.update({ where: { id: params.bedId }, data: { status: 'OCCUPIED' } });
}

async function assertBedAssignable(
  tx: TransactionClient,
  propertyId: string,
  bedId: string,
): Promise<void> {
  const bed = await tx.bed.findFirst({
    where: { id: bedId, room: { propertyId } },
    select: { status: true, room: { select: { status: true } } },
  });

  if (bed === null) throw new AppError('NOT_FOUND', 'Bed not found.');

  // A bed under maintenance or in an inactive room is not offerable, even though
  // it has no occupant.
  if (bed.status === 'MAINTENANCE' || bed.status === 'BLOCKED') {
    throw new AppError('BED_UNAVAILABLE', 'That bed is marked unavailable.');
  }
  if (bed.room.status !== 'ACTIVE') {
    throw new AppError('BED_UNAVAILABLE', 'That room is not currently in service.');
  }
}

export interface CreateResidentInput {
  existingUserId?: string | undefined;
  fullName: string;
  /** The login identity. Required, and already normalised to E.164 by the schema. */
  phone: string;
  email?: string | undefined;
  joiningDate: DateOnly;
  expectedExitDate?: DateOnly | undefined;
  bedId?: string | undefined;
  monthlyRentOverridePaise?: number | undefined;
  securityDepositPaise: number;
  emergencyContactName?: string | undefined;
  emergencyContactPhone?: string | undefined;
}

/**
 * Adds a resident, reusing the person's account when they already have one.
 *
 * Handles both paths from spec §7: assigning an already-registered user, and
 * creating a new one. An email that already exists is reused rather than
 * duplicated — the same person returning is a new stay, not a new person.
 */
export async function createResident(
  actor: Actor,
  input: CreateResidentInput,
): Promise<ResidentSummaryView> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'resident:write');

  const tenancyId = await prisma.$transaction(async (tx) => {
    const email = input.email?.toLowerCase() ?? null;
    // Matched on phone, not email: the phone number is the login identity and
    // the unique one, so it is what decides "have we met this person before?".
    const existing =
      input.existingUserId !== undefined
        ? await tx.user.findUnique({ where: { id: input.existingUserId } })
        : await tx.user.findUnique({ where: { phone: input.phone } });

    if (input.existingUserId !== undefined && existing === null) {
      throw new AppError('NOT_FOUND', 'That user account no longer exists.');
    }

    // One active stay per person per property. A second would make "which bed is
    // this person in?" ambiguous.
    if (existing !== null) {
      const active = await tx.tenancy.findFirst({
        where: {
          userId: existing.id,
          propertyId,
          status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
        },
        select: { id: true },
      });
      if (active !== null) {
        throw new AppError('ALREADY_EXISTS', 'This person already has an active stay here.');
      }
    }

    const user =
      existing ??
      (await tx.user.create({
        data: {
          fullName: input.fullName,
          email,
          phone: input.phone,
          // No password yet: the owner shares an invite, and the resident sets
          // one on first sign-in. An account with no password cannot log in.
          passwordHash: null,
          mustChangePassword: true,
          status: 'ACTIVE',
        },
      }));

    await tx.propertyMembership.upsert({
      where: { userId_propertyId: { userId: user.id, propertyId } },
      update: { role: 'RESIDENT' },
      create: { userId: user.id, propertyId, role: 'RESIDENT' },
    });

    // The membership role scopes authority at this property; the account's own
    // role is what sign-in and the JWT actually carry, so it must move too.
    if (user.role === 'NON_RESIDENT') {
      await tx.user.update({ where: { id: user.id }, data: { role: 'RESIDENT' } });
    }

    const tenancy = await tx.tenancy.create({
      data: {
        propertyId,
        userId: user.id,
        status: 'ACTIVE',
        joiningDate: toPrismaDate(input.joiningDate),
        expectedExitDate:
          input.expectedExitDate === undefined ? null : toPrismaDate(input.expectedExitDate),
        monthlyRentOverridePaise: input.monthlyRentOverridePaise ?? null,
        securityDepositPaise: input.securityDepositPaise,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
      },
    });

    const today = todayInZone(timezone);

    // The deposit is owed for becoming a resident at all, not for which bed
    // — unlike rent, its amount doesn't depend on a room, so it is raised
    // here unconditionally rather than only when a bed happens to be
    // assigned in this same request (Residents > Add deliberately leaves
    // bedId unset; a bed is assigned afterward from Rooms).
    await generateDepositInvoice(tx, {
      propertyId,
      tenancyId: tenancy.id,
      residentName: user.fullName,
      amountPaise: input.securityDepositPaise,
      issueDate: input.joiningDate,
      settings,
      today,
      actor: { userId: actor.userId, role: 'ADMIN' },
    });

    if (input.bedId !== undefined) {
      await assertBedAssignable(tx, propertyId, input.bedId);
      await openAllocation(tx, {
        tenancyId: tenancy.id,
        bedId: input.bedId,
        startedAt: input.joiningDate,
        reason: 'Move-in',
      });

      // Moving into a bed is what starts owing rent for it — the deposit,
      // above, does not wait for this.
      const bed = await tx.bed.findUniqueOrThrow({
        where: { id: input.bedId },
        select: { room: { select: { monthlyRentPaise: true } } },
      });
      const periodKey = periodKeyOf(input.joiningDate);
      const monthlyRent = input.monthlyRentOverridePaise ?? bed.room.monthlyRentPaise;

      // The move-in month is billed in full, not by the days left in it — a
      // room costs the same whether they moved in on the 1st or the 28th.
      // Only the SUBSEQUENT months are ever prorated by `calculateRent`, and
      // only for someone who leaves mid-month (see generateInvoiceForTenancy).
      if (monthlyRent > 0) {
        const sequence = await tx.invoice.count({ where: { propertyId, periodKey } });
        const number = `INV-${periodKey.replace('-', '')}-${String(sequence + 1).padStart(4, '0')}`;

        // The calendar due date may already be behind us for someone joining
        // late in the month — this invoice didn't exist yet for them to miss it.
        // A first invoice is never born overdue: it gets at least the normal
        // grace period counted from the day they actually moved in.
        const dueDate = maxDate(
          dueDateFor(periodKey, settings.rentDueDay),
          addDays(input.joiningDate, settings.graceDays),
        );

        const invoice = await tx.invoice.create({
          data: {
            propertyId,
            tenancyId: tenancy.id,
            periodKey,
            number,
            status: 'ISSUED',
            issueDate: toPrismaDate(input.joiningDate),
            dueDate: toPrismaDate(dueDate),
            items: {
              create: [{ kind: 'RENT' as const, description: 'Room rent', amountPaise: monthlyRent }],
            },
          },
        });

        await recomputeInvoice(tx, invoice.id, settings, today);
      }
    }

    await writeAudit(tx, {
      action: 'RESIDENT_ADDED',
      entityType: 'Tenancy',
      entityId: tenancy.id,
      propertyId,
      summary: `${user.fullName} added as a resident`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
    });

    return tenancy.id;
  });

  const residents = await listResidents(actor);
  const created = residents.find((resident) => resident.tenancyId === tenancyId);
  if (created === undefined)
    throw new AppError('INTERNAL_ERROR', 'Resident could not be read back.');
  return created;
}

export async function updateResident(
  actor: Actor,
  tenancyId: string,
  input: {
    fullName?: string | undefined;
    phone?: string | null | undefined;
    expectedExitDate?: DateOnly | null | undefined;
    monthlyRentOverridePaise?: number | null | undefined;
    securityDepositPaise?: number | undefined;
    emergencyContactName?: string | null | undefined;
    emergencyContactPhone?: string | null | undefined;
    status?: 'ACTIVE' | 'NOTICE_PERIOD' | 'VACATED' | undefined;
  },
): Promise<ResidentSummaryView> {
  const { propertyId } = await getPropertyContext(actor, 'resident:write');

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId },
    select: { id: true, userId: true },
  });
  if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');

  // VACATED is reached through the exit flow, which also releases the bed and
  // records the date — setting it here would leave the bed occupied forever.
  if (input.status === 'VACATED') {
    throw new AppError('VALIDATION_FAILED', 'Use the move-out action to end a stay.');
  }

  await prisma.$transaction(async (tx) => {
    if (input.fullName !== undefined || input.phone !== undefined) {
      try {
        await tx.user.update({
          where: { id: tenancy.userId },
          data: {
            ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
            ...(input.phone === undefined || input.phone === null ? {} : { phone: input.phone }),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError('ALREADY_EXISTS', 'Another resident already uses this phone number.');
        }
        throw error;
      }
    }

    await tx.tenancy.update({
      where: { id: tenancyId },
      data: {
        ...(input.expectedExitDate === undefined
          ? {}
          : {
              expectedExitDate:
                input.expectedExitDate === null ? null : toPrismaDate(input.expectedExitDate),
            }),
        ...(input.monthlyRentOverridePaise === undefined
          ? {}
          : { monthlyRentOverridePaise: input.monthlyRentOverridePaise }),
        ...(input.securityDepositPaise === undefined
          ? {}
          : { securityDepositPaise: input.securityDepositPaise }),
        ...(input.emergencyContactName === undefined
          ? {}
          : { emergencyContactName: input.emergencyContactName }),
        ...(input.emergencyContactPhone === undefined
          ? {}
          : { emergencyContactPhone: input.emergencyContactPhone }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
    });
  });

  const residents = await listResidents(actor);
  const updated = residents.find((resident) => resident.tenancyId === tenancyId);
  if (updated === undefined) throw new AppError('NOT_FOUND', 'Resident not found.');
  return updated;
}

/**
 * Moves a resident to a different bed.
 *
 * The old allocation is CLOSED before the new one opens, in one transaction —
 * both the "one open allocation per tenancy" and "per bed" indexes must hold at
 * every point, and the resident's history keeps both rows.
 */
export async function moveResident(
  actor: Actor,
  tenancyId: string,
  input: { toBedId: string; effectiveFrom?: DateOnly | undefined; reason?: string | undefined },
): Promise<ResidentSummaryView> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'bed:manage');
  const effectiveFrom = input.effectiveFrom ?? todayInZone(timezone);

  await prisma.$transaction(async (tx) => {
    const tenancy = await tx.tenancy.findFirst({
      where: { id: tenancyId, propertyId },
      include: {
        user: { select: { fullName: true } },
        allocations: {
          where: { endedAt: null },
          include: {
            bed: { select: { id: true, label: true, room: { select: { number: true } } } },
          },
        },
      },
    });
    if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');
    if (tenancy.status === 'VACATED') {
      throw new AppError('TENANCY_NOT_ACTIVE', 'This stay has already ended.');
    }

    const current = tenancy.allocations[0];
    if (current?.bedId === input.toBedId) {
      throw new AppError('CONFLICT', 'The resident is already in that bed.');
    }

    await assertBedAssignable(tx, propertyId, input.toBedId);

    if (current !== undefined) {
      await tx.allocation.update({
        where: { id: current.id },
        data: { endedAt: toPrismaDate(effectiveFrom) },
      });
      await tx.bed.update({ where: { id: current.bedId }, data: { status: 'AVAILABLE' } });
    }

    await openAllocation(tx, {
      tenancyId,
      bedId: input.toBedId,
      startedAt: effectiveFrom,
      reason: input.reason ?? 'Room change',
    });

    const destination = await tx.bed.findUniqueOrThrow({
      where: { id: input.toBedId },
      select: { label: true, room: { select: { number: true } } },
    });

    await writeAudit(tx, {
      action: 'RESIDENT_MOVED',
      entityType: 'Tenancy',
      entityId: tenancyId,
      propertyId,
      summary:
        current === undefined
          ? `${tenancy.user.fullName} assigned to room ${destination.room.number} bed ${destination.label}`
          : `${tenancy.user.fullName} moved from room ${current.bed.room.number} bed ${current.bed.label} to room ${destination.room.number} bed ${destination.label}`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
    });
  });

  const residents = await listResidents(actor);
  const moved = residents.find((resident) => resident.tenancyId === tenancyId);
  if (moved === undefined) throw new AppError('NOT_FOUND', 'Resident not found.');
  return moved;
}

/**
 * Ends a stay: closes the allocation, frees the bed, marks the tenancy
 * vacated, and — once no active stay is left for this person here — returns
 * their account to NON_RESIDENT.
 *
 * Refused while rent is still owed (spec: a resident with a pending balance
 * cannot be removed from their room). That is a deliberate change from
 * merely letting debt survive the move-out: RESIDENT standing is now the
 * thing that keeps a person collectible, so it is not given up first.
 */
export async function exitResident(
  actor: Actor,
  tenancyId: string,
  input: { actualExitDate: DateOnly; reason?: string | undefined },
): Promise<ResidentSummaryView> {
  const { propertyId } = await getPropertyContext(actor, 'resident:write');

  await prisma.$transaction(async (tx) => {
    const tenancy = await tx.tenancy.findFirst({
      where: { id: tenancyId, propertyId },
      include: {
        user: { select: { fullName: true } },
        allocations: { where: { endedAt: null } },
        invoices: { select: { totalPaise: true, amountPaidPaise: true, status: true } },
      },
    });
    if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');
    if (tenancy.status === 'VACATED') {
      throw new AppError('TENANCY_NOT_ACTIVE', 'This stay has already ended.');
    }

    const outstanding = tenancy.invoices
      .filter((invoice) => invoice.status !== 'CANCELLED')
      .reduce((sum, invoice) => sum + Math.max(0, invoice.totalPaise - invoice.amountPaidPaise), 0);
    if (outstanding > 0) {
      throw new AppError(
        'SETTLEMENT_REQUIRED',
        `${tenancy.user.fullName} still has rent outstanding. Settle or waive it before removing them from the room.`,
      );
    }

    for (const allocation of tenancy.allocations) {
      await tx.allocation.update({
        where: { id: allocation.id },
        data: { endedAt: toPrismaDate(input.actualExitDate) },
      });
      await tx.bed.update({ where: { id: allocation.bedId }, data: { status: 'AVAILABLE' } });
    }

    await tx.tenancy.update({
      where: { id: tenancyId },
      data: { status: 'VACATED', actualExitDate: toPrismaDate(input.actualExitDate) },
    });

    // Downgrade only once no other stay keeps them RESIDENT here — a person
    // moving beds via a fresh tenancy on the same day must not lose access
    // between the two writes.
    const otherActiveTenancy = await tx.tenancy.findFirst({
      where: {
        userId: tenancy.userId,
        propertyId,
        id: { not: tenancyId },
        status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
      },
      select: { id: true },
    });
    if (otherActiveTenancy === null) {
      await tx.propertyMembership.updateMany({
        where: { userId: tenancy.userId, propertyId, role: 'RESIDENT' },
        data: { role: 'NON_RESIDENT' },
      });
      await tx.user.updateMany({
        where: { id: tenancy.userId, role: 'RESIDENT' },
        data: { role: 'NON_RESIDENT' },
      });
    }

    await writeAudit(tx, {
      action: 'RESIDENT_EXITED',
      entityType: 'Tenancy',
      entityId: tenancyId,
      propertyId,
      summary: `${tenancy.user.fullName} moved out on ${input.actualExitDate}`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      after: { reason: input.reason ?? null },
    });
  });

  const residents = await listResidents(actor, { status: 'VACATED' });
  const exited = residents.find((resident) => resident.tenancyId === tenancyId);
  if (exited === undefined) throw new AppError('NOT_FOUND', 'Resident not found.');
  return exited;
}
