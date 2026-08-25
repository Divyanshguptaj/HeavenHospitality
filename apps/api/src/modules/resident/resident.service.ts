import type {
  InvoiceDetailView,
  InvoiceSummaryView,
  NoticeView,
  PaymentView,
  ResidentHomeView,
} from '@heaven/contracts';

import { AppError } from '../../errors/AppError.js';
import { currentPeriodKey, fromPrismaDate, todayInZone, toPrismaDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { readInvoiceDetail } from '../billing/invoice.service.js';
import { getTodaysMenu } from '../mess/mess.service.js';
import { getActiveTenancyForActor } from '../property/property.context.js';

/**
 * The resident's own view of their stay.
 *
 * Every query here is scoped to the tenancy resolved from the AUTHENTICATED
 * USER, never from an id in the request. That is what makes it structurally
 * impossible for one resident to read another's rent, payments or complaints —
 * there is no parameter to tamper with.
 */

export async function getResidentHome(actor: Actor): Promise<ResidentHomeView> {
  const { tenancyId, propertyId, timezone } = await getActiveTenancyForActor(actor);
  const today = todayInZone(timezone);
  const periodKey = currentPeriodKey(timezone);

  const tenancy = await prisma.tenancy.findUniqueOrThrow({
    where: { id: tenancyId },
    include: {
      user: { select: { fullName: true } },
      allocations: {
        where: { endedAt: null },
        include: {
          bed: {
            select: {
              label: true,
              room: {
                select: {
                  number: true,
                  roomType: true,
                  isAirConditioned: true,
                  floor: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      invoices: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { periodKey: 'desc' },
        select: { id: true, periodKey: true, totalPaise: true, amountPaidPaise: true },
      },
    },
  });

  // The current month's invoice if it exists, otherwise the most recent one —
  // early in a month there may not be a new bill yet, and showing nothing would
  // be less useful than showing what is actually owed.
  const current =
    tenancy.invoices.find((invoice) => invoice.periodKey === periodKey) ?? tenancy.invoices[0];

  const [menu, absences, notices, complaintCounts] = await Promise.all([
    getTodaysMenu(propertyId, today),
    prisma.mealAbsence.findMany({
      where: { tenancyId, date: toPrismaDate(today) },
      select: { mealType: true },
    }),
    prisma.notice.findMany({
      where: {
        propertyId,
        startsOn: { lte: toPrismaDate(today) },
        OR: [{ endsOn: null }, { endsOn: { gte: toPrismaDate(today) } }],
      },
      orderBy: [{ isPinned: 'desc' }, { startsOn: 'desc' }],
      take: 5,
    }),
    prisma.complaint.groupBy({
      by: ['status'],
      where: { raisedByUserId: actor.userId },
      _count: { _all: true },
    }),
  ]);

  const absentMeals = new Set(absences.map((absence) => absence.mealType));
  const countBy = new Map(complaintCounts.map((row) => [row.status, row._count._all]));

  const allocation = tenancy.allocations[0];

  return {
    resident: {
      tenancyId,
      fullName: tenancy.user.fullName,
      status: tenancy.status,
      joiningDate: fromPrismaDate(tenancy.joiningDate),
    },
    placement:
      allocation === undefined
        ? null
        : {
            roomNumber: allocation.bed.room.number,
            roomType: allocation.bed.room.roomType,
            bedLabel: allocation.bed.label,
            floorName: allocation.bed.room.floor.name,
            isAirConditioned: allocation.bed.room.isAirConditioned,
          },
    currentInvoice: current === undefined ? null : await readInvoiceDetail(current.id, propertyId),
    outstandingPaise: tenancy.invoices.reduce(
      (sum, invoice) => sum + Math.max(0, invoice.totalPaise - invoice.amountPaidPaise),
      0,
    ),
    todaysMenu: menu.map((meal) => ({ ...meal, isAbsent: absentMeals.has(meal.mealType) })),
    notices: notices.map(toNoticeView),
    complaints: {
      open: countBy.get('OPEN') ?? 0,
      inProgress: countBy.get('IN_PROGRESS') ?? 0,
      resolved: (countBy.get('RESOLVED') ?? 0) + (countBy.get('CLOSED') ?? 0),
    },
  };
}

export function toNoticeView(notice: {
  id: string;
  title: string;
  body: string;
  startsOn: Date;
  endsOn: Date | null;
  isPinned: boolean;
}): NoticeView {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    startsOn: fromPrismaDate(notice.startsOn),
    endsOn: notice.endsOn === null ? null : fromPrismaDate(notice.endsOn),
    isPinned: notice.isPinned,
  };
}

export async function listResidentInvoices(actor: Actor): Promise<InvoiceSummaryView[]> {
  const { tenancyId } = await getActiveTenancyForActor(actor);

  const invoices = await prisma.invoice.findMany({
    where: { tenancyId },
    orderBy: { periodKey: 'desc' },
    include: {
      tenancy: {
        include: {
          user: { select: { fullName: true } },
          allocations: {
            where: { endedAt: null },
            include: { bed: { select: { room: { select: { number: true } } } } },
          },
        },
      },
    },
  });

  return invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    periodKey: invoice.periodKey,
    status: invoice.status,
    issueDate: fromPrismaDate(invoice.issueDate),
    dueDate: fromPrismaDate(invoice.dueDate),
    totalPaise: invoice.totalPaise,
    amountPaidPaise: invoice.amountPaidPaise,
    outstandingPaise: Math.max(0, invoice.totalPaise - invoice.amountPaidPaise),
    residentName: invoice.tenancy.user.fullName,
    roomNumber: invoice.tenancy.allocations[0]?.bed.room.number ?? null,
    tenancyId: invoice.tenancyId,
  }));
}

export async function getResidentInvoice(
  actor: Actor,
  invoiceId: string,
): Promise<InvoiceDetailView> {
  const { tenancyId, propertyId } = await getActiveTenancyForActor(actor);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenancyId },
    select: { id: true },
  });
  if (invoice === null) throw new AppError('NOT_FOUND', 'Invoice not found.');

  return readInvoiceDetail(invoiceId, propertyId);
}

export async function listResidentPayments(actor: Actor): Promise<PaymentView[]> {
  const { tenancyId } = await getActiveTenancyForActor(actor);

  const payments = await prisma.payment.findMany({
    where: { tenancyId },
    orderBy: { createdAt: 'desc' },
    include: {
      receipts: { select: { number: true } },
      tenancy: { include: { user: { select: { fullName: true } } } },
    },
  });

  return payments.map((payment) => ({
    id: payment.id,
    amountPaise: payment.amountPaise,
    method: payment.method,
    status: payment.status,
    reference: payment.reference,
    notes: payment.notes,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    residentName: payment.tenancy.user.fullName,
    tenancyId: payment.tenancyId,
    receiptNumber: payment.receipts[0]?.number ?? null,
    unallocatedPaise: payment.unallocatedPaise,
  }));
}

/** The resident's electricity history, so a charge on their bill is explainable. */
export async function listResidentElectricity(actor: Actor): Promise<
  Array<{
    periodKey: string;
    roomNumber: string;
    previousReading: number;
    currentReading: number;
    units: number;
    ratePaisePerUnit: number;
    sharePaise: number;
    occupiedDays: number;
  }>
> {
  const { tenancyId } = await getActiveTenancyForActor(actor);

  const shares = await prisma.electricityShare.findMany({
    where: { tenancyId, reading: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'desc' },
    include: { reading: { include: { room: { select: { number: true } } } } },
  });

  return shares.map((share) => ({
    periodKey: share.reading.periodKey,
    roomNumber: share.reading.room.number,
    previousReading: share.reading.previousReading,
    currentReading: share.reading.currentReading,
    units: share.reading.units,
    ratePaisePerUnit: share.reading.ratePaisePerUnit,
    sharePaise: share.sharePaise,
    occupiedDays: share.occupiedDays,
  }));
}

/**
 * Payment details the resident needs in order to pay by UPI or bank transfer.
 * Available to any resident regardless of the public-visibility flag, which only
 * governs whether GUESTS see them.
 */
export async function getResidentPaymentDetails(actor: Actor): Promise<{
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  upiId: string | null;
  upiQrImageUrl: string | null;
}> {
  const { settings } = await getActiveTenancyForActor(actor);

  return {
    bankAccountName: settings.bankAccountName,
    bankAccountNumber: settings.bankAccountNumber,
    bankIfsc: settings.bankIfsc,
    bankName: settings.bankName,
    upiId: settings.upiId,
    upiQrImageUrl: settings.upiQrImageUrl,
  };
}
