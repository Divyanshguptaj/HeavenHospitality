import type { InvoiceDetailView, InvoiceSummaryView } from '@heaven/contracts';
import { sumPaise } from '@heaven/money';
import type { PropertySettings } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import {
  dueDateFor,
  firstDayOfPeriod,
  fromPrismaDate,
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

  // Settlement date drives the late fee: paying late must not keep costing more
  // afterwards. Derived from when the principal was actually covered.
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

  const total = principal + lateFee.amountPaise;

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
      user: { select: { fullName: true } },
      allocations: {
        include: {
          bed: { select: { room: { select: { monthlyRentPaise: true, number: true } } } },
        },
        orderBy: { startedAt: 'asc' },
      },
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
    const existing = await prisma.invoice.findUnique({
      where: { tenancyId_periodKey: { tenancyId: tenancy.id, periodKey } },
      select: { id: true },
    });

    if (existing !== null) {
      skipped += 1;
      continue;
    }

    const roomRent = tenancy.allocations.at(-1)?.bed.room.monthlyRentPaise ?? 0;
    const monthlyRent = tenancy.monthlyRentOverridePaise ?? roomRent;

    const rent = calculateRent({
      periodKey,
      monthlyRentPaise: monthlyRent,
      joiningDate: fromPrismaDate(tenancy.joiningDate),
      exitDate: tenancy.actualExitDate === null ? null : fromPrismaDate(tenancy.actualExitDate),
    });

    // Nothing to bill: they were not resident during this period at all.
    if (rent.amountPaise === 0 && tenancy.electricityShares.length === 0) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const sequence = await tx.invoice.count({ where: { propertyId, periodKey } });
      const number = `INV-${periodKey.replace('-', '')}-${String(sequence + 1).padStart(4, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          propertyId,
          tenancyId: tenancy.id,
          periodKey,
          number,
          status: 'ISSUED',
          // Issued at the start of the period; rent is charged in advance.
          issueDate: toPrismaDate(firstDayOfPeriod(periodKey)),
          dueDate: toPrismaDate(dueDateFor(periodKey, settings.rentDueDay)),
          items: {
            create: [
              ...(rent.amountPaise > 0
                ? [
                    {
                      kind: 'RENT' as const,
                      description: rent.isProrated
                        ? `Room rent — ${rent.occupiedDays} of ${rent.daysInPeriod} days`
                        : 'Room rent',
                      amountPaise: rent.amountPaise,
                    },
                  ]
                : []),
              ...tenancy.electricityShares.map((share) => ({
                kind: 'ELECTRICITY' as const,
                description: `Electricity — room ${share.reading.room.number}, ${share.reading.units} units @ ₹${(share.reading.ratePaisePerUnit / 100).toFixed(2)}/unit`,
                amountPaise: share.sharePaise,
                sourceType: 'ElectricityShare',
                sourceId: share.id,
              })),
            ],
          },
        },
      });

      await recomputeInvoice(tx, invoice.id, settings, today);

      await writeAudit(tx, {
        action: 'INVOICE_ISSUED',
        entityType: 'Invoice',
        entityId: invoice.id,
        propertyId,
        summary: `Invoice ${number} issued to ${tenancy.user.fullName} for ${periodKey}`,
        actorUserId: actor.userId,
        actorRole: 'OWNER',
      });
    });

    created += 1;
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
      actorRole: 'OWNER',
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
      actorRole: 'OWNER',
    });
  });

  return readInvoiceDetail(invoiceId, propertyId);
}
