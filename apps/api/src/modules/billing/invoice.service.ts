import type { InvoiceDetailView, InvoiceSummaryView } from '@heaven/contracts';
import { sumPaise } from '@heaven/money';
import type { Prisma, PropertySettings } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import {
  addDays,
  dueDateFor,
  firstDayOfPeriod,
  fromPrismaDate,
  maxDate,
  todayInZone,
  toPrismaDate,
  type DateOnly,
  type PeriodKey,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getPropertyContext } from '../property/property.context.js';
import { calculateLateFee, calculateRent, deriveInvoiceStatus } from './billing.calculations.js';

/**
 * Invoices.
 *
 * An invoice is a set of identifiable line items, never a single opaque total
 * (spec §9): the resident can see exactly what rent, electricity and late fee
 * they are being charged, and each line traces back to what produced it.
 */

const INVOICE_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
  tenancy: {
    include: {
      user: { select: { fullName: true } },
      allocations: {
        where: { endedAt: null },
        include: { bed: { select: { room: { select: { number: true } } } } },
      },
    },
  },
} as const;

type InvoiceRecord = Awaited<
  ReturnType<typeof prisma.invoice.findFirstOrThrow<{ include: typeof INVOICE_INCLUDE }>>
>;

function toSummary(invoice: InvoiceRecord): InvoiceSummaryView {
  return {
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
    residentName: invoice.tenancy.user.fullName,
    roomNumber: invoice.tenancy.allocations[0]?.bed.room.number ?? null,
    tenancyId: invoice.tenancyId,
  };
}

/**
 * Recomputes an invoice's late fee, total and status.
 *
 * The late fee is UPSERTED onto a single line rather than appended, which is
 * what makes the nightly job idempotent: running it any number of times
 * converges on the same figure, and a missed night self-heals.
 *
 * Called inside the caller's transaction so an invoice is never briefly wrong.
 */
export async function recomputeInvoice(
  tx: TransactionClient,
  invoiceId: string,
  settings: PropertySettings,
  today: DateOnly,
): Promise<void> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });

  if (invoice.status === 'CANCELLED') return;

  const principal = sumPaise(
    invoice.items.filter((item) => item.kind !== 'LATE_FEE').map((item) => item.amountPaise),
  );

  // A deposit is never rent: it is billed on its own invoice (never mixed
  // with a RENT item — see generateDepositInvoice), and it carries no
  // schedule-driven late fee. Left unpaid, or paid in parts, it just sits at
  // whatever status that leaves it — never an extra charge on top.
  const isDepositInvoice = invoice.category === 'DEPOSIT';

  let lateFeeAmountPaise = 0;

  if (!isDepositInvoice) {
    // Settlement date drives the late fee: paying late must not keep costing
    // more afterwards. Derived from when the principal was actually covered.
    const settledOn =
      invoice.amountPaidPaise >= principal && invoice.amountPaidPaise > 0
        ? await latestPaymentDate(tx, invoice.id, today)
        : null;

    const lateFee = calculateLateFee({
      dueDate: fromPrismaDate(invoice.dueDate),
      graceDays: settings.graceDays,
      perDayPaise: settings.lateFeePerDayPaise,
      capPaise: settings.lateFeeCapPaise,
      asOf: today,
      settledOn,
      isWaived: invoice.lateFeeWaivedAt !== null,
      outstandingPaise: Math.max(0, principal - invoice.amountPaidPaise),
    });
    lateFeeAmountPaise = lateFee.amountPaise;

    const existingLateFee = invoice.items.find((item) => item.kind === 'LATE_FEE');

    if (lateFee.amountPaise > 0) {
      const description = `Late fee — ${lateFee.overdueDays} day(s)${lateFee.isCapped ? ' (capped)' : ''}`;
      if (existingLateFee === undefined) {
        await tx.invoiceItem.create({
          data: {
            invoiceId,
            kind: 'LATE_FEE',
            description,
            amountPaise: lateFee.amountPaise,
            sourceType: 'LateFeeRule',
          },
        });
      } else if (
        existingLateFee.amountPaise !== lateFee.amountPaise ||
        existingLateFee.description !== description
      ) {
        await tx.invoiceItem.update({
          where: { id: existingLateFee.id },
          data: { amountPaise: lateFee.amountPaise, description },
        });
      }
    } else if (existingLateFee !== undefined) {
      // Waived, or settled within grace — the line is removed rather than zeroed,
      // so the invoice does not carry a meaningless ₹0 row.
      await tx.invoiceItem.delete({ where: { id: existingLateFee.id } });
    }
  }

  const total = principal + lateFeeAmountPaise;

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      totalPaise: total,
      status: deriveInvoiceStatus({
        totalPaise: total,
        amountPaidPaise: invoice.amountPaidPaise,
        dueDate: fromPrismaDate(invoice.dueDate),
        asOf: today,
      }),
    },
  });
}

async function latestPaymentDate(
  tx: TransactionClient,
  invoiceId: string,
  fallback: DateOnly,
): Promise<DateOnly> {
  const allocation = await tx.paymentAllocation.findFirst({
    where: { invoiceId, payment: { status: 'PAID' } },
    orderBy: { payment: { paidAt: 'desc' } },
    include: { payment: { select: { paidAt: true } } },
  });

  const paidAt = allocation?.payment.paidAt;
  if (paidAt === undefined || paidAt === null) return fallback;

  return fromPrismaDate(
    new Date(Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), paidAt.getUTCDate())),
  );
}

const TENANCY_FOR_BILLING_INCLUDE = {
  user: { select: { fullName: true } },
  allocations: {
    include: {
      bed: { select: { room: { select: { monthlyRentPaise: true, number: true } } } },
    },
    orderBy: { startedAt: 'asc' },
  },
} as const;

type TenancyForBilling = Prisma.TenancyGetPayload<{ include: typeof TENANCY_FOR_BILLING_INCLUDE }> & {
  electricityShares: ReadonlyArray<{
    readonly id: string;
    readonly sharePaise: number;
    readonly reading: {
      readonly units: number;
      readonly ratePaisePerUnit: number;
      readonly room: { readonly number: string };
    };
  }>;
};

/**
 * Raises one tenancy's invoice(s) for a period, if it doesn't have them yet
 * and there is anything to bill. The building block behind both the owner's
 * manual "generate invoices" action and the automatic month-rollover job —
 * neither an actor nor a request is required, so a system-triggered run
 * calls this exactly like an owner-triggered one does.
 *
 * Rent and electricity are raised as two separate invoices sharing the same
 * period, each independently checked against the tenancyId+periodKey+category
 * unique key — so a resident can settle one without the other being touched,
 * and re-running this after one of the two already exists still raises the
 * other instead of skipping outright.
 *
 * Runs inside the caller's transaction so an invoice and its audit entry
 * cannot diverge.
 */
export async function generateInvoiceForTenancy(
  tx: TransactionClient,
  params: {
    propertyId: string;
    periodKey: PeriodKey;
    settings: PropertySettings;
    today: DateOnly;
    tenancy: TenancyForBilling;
    actor?: { readonly userId: string; readonly role: string } | undefined;
  },
): Promise<boolean> {
  const { propertyId, periodKey, settings, today, tenancy, actor } = params;

  const roomRent = tenancy.allocations.at(-1)?.bed.room.monthlyRentPaise ?? 0;
  const monthlyRent = tenancy.monthlyRentOverridePaise ?? roomRent;

  const rent = calculateRent({
    periodKey,
    monthlyRentPaise: monthlyRent,
    joiningDate: fromPrismaDate(tenancy.joiningDate),
    exitDate: tenancy.actualExitDate === null ? null : fromPrismaDate(tenancy.actualExitDate),
  });

  let raisedAny = false;

  if (rent.amountPaise > 0) {
    raisedAny =
      (await raiseCategoryInvoice(tx, {
        propertyId,
        periodKey,
        category: 'RENT',
        settings,
        today,
        tenancy,
        actor,
        items: [
          {
            kind: 'RENT' as const,
            description: rent.isProrated
              ? `Room rent — ${rent.occupiedDays} of ${rent.daysInPeriod} days`
              : 'Room rent',
            amountPaise: rent.amountPaise,
          },
        ],
      })) || raisedAny;
  }

  if (tenancy.electricityShares.length > 0) {
    raisedAny =
      (await raiseCategoryInvoice(tx, {
        propertyId,
        periodKey,
        category: 'ELECTRICITY',
        settings,
        today,
        tenancy,
        actor,
        items: tenancy.electricityShares.map((share) => ({
          kind: 'ELECTRICITY' as const,
          description: `Electricity — room ${share.reading.room.number}, ${share.reading.units} units @ ₹${(share.reading.ratePaisePerUnit / 100).toFixed(2)}/unit`,
          amountPaise: share.sharePaise,
          sourceType: 'ElectricityShare',
          sourceId: share.id,
        })),
      })) || raisedAny;
  }

  return raisedAny;
}

async function raiseCategoryInvoice(
  tx: TransactionClient,
  params: {
    propertyId: string;
    periodKey: PeriodKey;
    category: 'RENT' | 'ELECTRICITY';
    settings: PropertySettings;
    today: DateOnly;
    tenancy: TenancyForBilling;
    actor?: { readonly userId: string; readonly role: string } | undefined;
    items: ReadonlyArray<{
      kind: 'RENT' | 'ELECTRICITY';
      description: string;
      amountPaise: number;
      sourceType?: string;
      sourceId?: string;
    }>;
  },
): Promise<boolean> {
  const { propertyId, periodKey, category, settings, today, tenancy, actor, items } = params;

  const existing = await tx.invoice.findUnique({
    where: { tenancyId_periodKey_category: { tenancyId: tenancy.id, periodKey, category } },
    select: { id: true },
  });
  if (existing !== null) return false;

  const sequence = await tx.invoice.count({ where: { propertyId, periodKey } });
  const prefix = category === 'RENT' ? 'INV' : 'INV-ELEC';
  const number = `${prefix}-${periodKey.replace('-', '')}-${String(sequence + 1).padStart(4, '0')}`;

  // Rent is raised at the start of the period, right on the calendar due date
  // schedule. Electricity is not — a meter reading can land days or weeks into
  // the month, and giving it the SAME due date would make it born already
  // overdue with a late fee attached the instant it's created. So the due date
  // is never earlier than today plus the normal grace period, same principle
  // as a resident's first rent invoice in createResident.
  const dueDate = maxDate(dueDateFor(periodKey, settings.rentDueDay), addDays(today, settings.graceDays));

  const invoice = await tx.invoice.create({
    data: {
      propertyId,
      tenancyId: tenancy.id,
      periodKey,
      category,
      number,
      status: 'ISSUED',
      // Issued at the start of the period; rent and electricity are both
      // charged in advance on the same schedule.
      issueDate: toPrismaDate(firstDayOfPeriod(periodKey)),
      dueDate: toPrismaDate(dueDate),
      items: { create: [...items] },
    },
  });

  await recomputeInvoice(tx, invoice.id, settings, today);

  await writeAudit(tx, {
    action: 'INVOICE_ISSUED',
    entityType: 'Invoice',
    entityId: invoice.id,
    propertyId,
    summary: `Invoice ${number} issued to ${tenancy.user.fullName} for ${periodKey}`,
    actorUserId: actor?.userId,
    actorRole: actor?.role ?? 'SYSTEM',
  });

  return true;
}

/**
 * The sentinel `periodKey` a deposit invoice is filed under — never a real
 * "YYYY-MM" period, so `@@unique([tenancyId, periodKey])` gives a tenancy at
 * most one deposit invoice, and the monthly rollover/rent-generation code
 * (which only ever asks for real calendar periods) never touches it.
 */
export const DEPOSIT_PERIOD_KEY: PeriodKey = 'DEPOSIT';

/**
 * Raises the one-time security-deposit invoice for a tenancy.
 *
 * Kept on its own invoice rather than as a line on the rent invoice: rent is
 * always settled in full each period, but a deposit may be paid in full, in
 * parts, or not yet, and a future payment needs to be able to target one
 * without touching the other. It also carries no late fee — see the
 * `isDepositInvoice` guard in `recomputeInvoice`.
 */
export async function generateDepositInvoice(
  tx: TransactionClient,
  params: {
    propertyId: string;
    tenancyId: string;
    residentName: string;
    amountPaise: number;
    issueDate: DateOnly;
    settings: PropertySettings;
    today: DateOnly;
    actor?: { readonly userId: string; readonly role: string } | undefined;
  },
): Promise<boolean> {
  const { propertyId, tenancyId, residentName, amountPaise, issueDate, settings, today, actor } = params;

  if (amountPaise <= 0) return false;

  const existing = await tx.invoice.findUnique({
    where: {
      tenancyId_periodKey_category: { tenancyId, periodKey: DEPOSIT_PERIOD_KEY, category: 'DEPOSIT' },
    },
    select: { id: true },
  });
  if (existing !== null) return false;

  const sequence = await tx.invoice.count({ where: { propertyId, periodKey: DEPOSIT_PERIOD_KEY } });
  const number = `INV-DEPOSIT-${String(sequence + 1).padStart(4, '0')}`;

  const invoice = await tx.invoice.create({
    data: {
      propertyId,
      tenancyId,
      periodKey: DEPOSIT_PERIOD_KEY,
      category: 'DEPOSIT',
      number,
      status: 'ISSUED',
      issueDate: toPrismaDate(issueDate),
      // Due the day it's issued — a deposit isn't on rent's monthly clock, and
      // it never accrues a late fee, so this only marks it outstanding from
      // day one rather than putting it under any real deadline pressure.
      dueDate: toPrismaDate(issueDate),
      items: { create: [{ kind: 'DEPOSIT', description: 'Security deposit', amountPaise }] },
    },
  });

  await recomputeInvoice(tx, invoice.id, settings, today);

  await writeAudit(tx, {
    action: 'INVOICE_ISSUED',
    entityType: 'Invoice',
    entityId: invoice.id,
    propertyId,
    summary: `Deposit invoice ${number} issued to ${residentName}`,
    actorUserId: actor?.userId,
    actorRole: actor?.role ?? 'SYSTEM',
  });

  return true;
}

/**
 * Generates one invoice per active resident for a billing period.
 *
 * Idempotent by construction: `@@unique([tenancyId, periodKey])` means a second
 * run cannot create a duplicate, so re-running after a partial failure is safe
 * and produces no double charges.
 *
 * Rent is pro-rated for anyone who joined or left mid-month, and any electricity
 * share already recorded for the period is pulled in as its own line.
 */
export async function generateInvoicesForPeriod(
  actor: Actor,
  periodKey: PeriodKey,
): Promise<{ created: number; skipped: number }> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'invoice:write');
  const today = todayInZone(timezone);

  const tenancies = await prisma.tenancy.findMany({
    where: {
      propertyId,
      // Anyone who was resident during the period, including those who have
      // since left — they still owe for the days they were here.
      OR: [{ status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }, { actualExitDate: { not: null } }],
    },
    include: {
      ...TENANCY_FOR_BILLING_INCLUDE,
      electricityShares: {
        where: { reading: { periodKey, status: 'ACTIVE' } },
        include: {
          reading: {
            select: { units: true, ratePaisePerUnit: true, room: { select: { number: true } } },
          },
        },
      },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const tenancy of tenancies) {
    const wasCreated = await prisma.$transaction((tx) =>
      generateInvoiceForTenancy(tx, {
        propertyId,
        periodKey,
        settings,
        today,
        tenancy,
        actor: { userId: actor.userId, role: 'ADMIN' },
      }),
    );
    if (wasCreated) created += 1;
    else skipped += 1;
  }

  return { created, skipped };
}

export async function listInvoices(
  actor: Actor,
  filters: Loose<{ periodKey: string; status: string; search: string }> = {},
): Promise<InvoiceSummaryView[]> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'invoice:read');

  // Statuses are refreshed on read so an invoice that has just become overdue is
  // never shown as merely unpaid. One UPDATE, not a recompute per invoice.
  await refreshOverdueStatuses(propertyId, todayInZone(timezone));

  const invoices = await prisma.invoice.findMany({
    where: {
      propertyId,
      ...(filters.periodKey === undefined ? {} : { periodKey: filters.periodKey }),
      ...(filters.status === undefined || filters.status === 'ALL'
        ? {}
        : filters.status === 'UNPAID'
          ? { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } }
          : { status: filters.status as InvoiceRecord['status'] }),
      ...(filters.search === undefined || filters.search === ''
        ? {}
        : {
            OR: [
              { number: { contains: filters.search, mode: 'insensitive' as const } },
              {
                tenancy: {
                  user: { fullName: { contains: filters.search, mode: 'insensitive' as const } },
                },
              },
            ],
          }),
    },
    orderBy: [{ periodKey: 'desc' }, { number: 'asc' }],
    include: INVOICE_INCLUDE,
  });

  return invoices.map(toSummary);
}

/**
 * Flips past-due invoices to OVERDUE, in ONE query.
 *
 * Deliberately does NOT recompute late fees: doing that for every invoice on
 * every page load meant dozens of round trips inside a single interactive
 * transaction, which exceeded Prisma's transaction timeout as soon as the
 * property had a few months of history.
 *
 * The fee AMOUNT is the nightly job's responsibility (and is recomputed whenever
 * a payment lands). Because that calculation is a pure function of the invoice,
 * deferring it changes nothing about the result — only when it is written.
 */
async function refreshOverdueStatuses(propertyId: string, today: DateOnly): Promise<void> {
  await prisma.invoice.updateMany({
    where: {
      propertyId,
      status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      dueDate: { lt: toPrismaDate(today) },
    },
    data: { status: 'OVERDUE' },
  });
}

export async function getInvoice(actor: Actor, invoiceId: string): Promise<InvoiceDetailView> {
  const { propertyId } = await getPropertyContext(actor, 'invoice:read');
  return readInvoiceDetail(invoiceId, propertyId);
}

export async function readInvoiceDetail(
  invoiceId: string,
  propertyId: string,
): Promise<InvoiceDetailView> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId },
    include: {
      ...INVOICE_INCLUDE,
      allocations: {
        include: { payment: { include: { receipts: { select: { number: true } } } } },
      },
    },
  });

  if (invoice === null) throw new AppError('NOT_FOUND', 'Invoice not found.');

  return {
    ...toSummary(invoice),
    items: invoice.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      description: item.description,
      amountPaise: item.amountPaise,
    })),
    lateFeeWaivedAt: invoice.lateFeeWaivedAt?.toISOString() ?? null,
    notes: invoice.notes,
    payments: invoice.allocations.map((allocation) => ({
      id: allocation.payment.id,
      amountPaise: allocation.amountPaise,
      method: allocation.payment.method,
      status: allocation.payment.status,
      reference: allocation.payment.reference,
      notes: allocation.payment.notes,
      paidAt: allocation.payment.paidAt?.toISOString() ?? null,
      createdAt: allocation.payment.createdAt.toISOString(),
      residentName: invoice.tenancy.user.fullName,
      tenancyId: invoice.tenancyId,
      receiptNumber: allocation.payment.receipts[0]?.number ?? null,
      unallocatedPaise: allocation.payment.unallocatedPaise,
    })),
  };
}

/** Adds an ad-hoc charge or a discount (spec §9 — charges are never hidden). */
export async function addInvoiceItem(
  actor: Actor,
  invoiceId: string,
  input: { kind: 'OTHER' | 'DISCOUNT'; description: string; amountPaise: number },
): Promise<InvoiceDetailView> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'invoice:write');
  const today = todayInZone(timezone);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId },
    select: { id: true, status: true },
  });
  if (invoice === null) throw new AppError('NOT_FOUND', 'Invoice not found.');
  if (invoice.status === 'CANCELLED') {
    throw new AppError('INVOICE_NOT_PAYABLE', 'This invoice has been cancelled.');
  }

  // The sign is enforced by kind rather than trusted from the client: a
  // "discount" that increased the bill would be a nasty bug.
  const amountPaise =
    input.kind === 'DISCOUNT' ? -Math.abs(input.amountPaise) : Math.abs(input.amountPaise);

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.create({
      data: { invoiceId, kind: input.kind, description: input.description, amountPaise },
    });
    await recomputeInvoice(tx, invoiceId, settings, today);
    await writeAudit(tx, {
      action: 'INVOICE_ADJUSTED',
      entityType: 'Invoice',
      entityId: invoiceId,
      propertyId,
      summary: `${input.kind === 'DISCOUNT' ? 'Discount' : 'Charge'} added: ${input.description}`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      after: { description: input.description, amountPaise },
    });
  });

  return readInvoiceDetail(invoiceId, propertyId);
}

export async function setLateFeeWaiver(
  actor: Actor,
  invoiceId: string,
  waived: boolean,
): Promise<InvoiceDetailView> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'invoice:write');
  const today = todayInZone(timezone);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId },
    select: { id: true },
  });
  if (invoice === null) throw new AppError('NOT_FOUND', 'Invoice not found.');

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { lateFeeWaivedAt: waived ? new Date() : null },
    });
    await recomputeInvoice(tx, invoiceId, settings, today);
    await writeAudit(tx, {
      action: 'INVOICE_ADJUSTED',
      entityType: 'Invoice',
      entityId: invoiceId,
      propertyId,
      summary: waived ? 'Late fee waived' : 'Late fee waiver removed',
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
    });
  });

  return readInvoiceDetail(invoiceId, propertyId);
}
