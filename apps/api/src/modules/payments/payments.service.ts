import type { PaymentView, ReceiptView } from '@heaven/contracts';
import { formatINR, sumPaise } from '@heaven/money';
import type { PaymentMethod, PropertySettings } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import {
  fiscalYearOf,
  todayInZone,
  toPrismaDate,
  type DateOnly,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { recomputeInvoice } from '../billing/invoice.service.js';
import { notify } from '../notifications/notification.service.js';
import { getPropertyContext } from '../property/property.context.js';

/**
 * Payments and receipts.
 *
 * The backend owns every number: the payable amount comes from the invoice, not
 * from the client, and a payment is only ever recorded after the server is
 * satisfied it happened. See docs/0007-payments.md.
 */

/**
 * Issues the next gapless receipt number for a property and financial year.
 *
 * `SELECT … FOR UPDATE` locks the sequence row for the rest of the transaction.
 * `count() + 1` would race: two concurrent payments read the same count and mint
 * the same number, which is exactly the kind of duplicate an auditor notices.
 */
async function nextReceiptNumber(
  tx: TransactionClient,
  propertyId: string,
  paidOn: DateOnly,
): Promise<string> {
  const fiscalYear = fiscalYearOf(paidOn);

  await tx.receiptSequence.upsert({
    where: { propertyId_fiscalYear: { propertyId, fiscalYear } },
    update: {},
    create: { propertyId, fiscalYear, lastNumber: 0 },
  });

  const locked = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    SELECT "lastNumber" FROM "ReceiptSequence"
     WHERE "propertyId" = ${propertyId}::uuid AND "fiscalYear" = ${fiscalYear}
     FOR UPDATE
  `;

  const next = (locked[0]?.lastNumber ?? 0) + 1;

  await tx.receiptSequence.update({
    where: { propertyId_fiscalYear: { propertyId, fiscalYear } },
    data: { lastNumber: next },
  });

  return `HH/${fiscalYear}/${String(next).padStart(4, '0')}`;
}

/**
 * Records a settled payment: allocates it, updates the invoices, issues a
 * receipt per invoice — all in ONE transaction.
 *
 * A payment without a receipt, or an invoice whose paid amount disagrees with
 * the payments against it, must not be able to exist even for an instant.
 *
 * The caller says how much went to each invoice (rent, AC bill, deposit — any
 * subset, any amount up to what that invoice still owes). Each amount is
 * checked against the invoice's balance here, inside the transaction, so a
 * stale screen cannot over-settle an invoice.
 */
async function settlePayment(
  tx: TransactionClient,
  params: {
    propertyId: string;
    tenancyId: string;
    allocations: ReadonlyArray<{ invoiceId: string; amountPaise: number }>;
    method: PaymentMethod;
    paidOn: DateOnly;
    settings: PropertySettings;
    today: DateOnly;
    reference?: string | undefined;
    notes?: string | undefined;
    recordedByUserId?: string | undefined;
    idempotencyKey?: string | undefined;
  },
): Promise<{ paymentId: string; receiptNumbers: string[]; amountPaise: number }> {
  const requested = new Map<string, number>();
  for (const allocation of params.allocations) {
    requested.set(
      allocation.invoiceId,
      (requested.get(allocation.invoiceId) ?? 0) + allocation.amountPaise,
    );
  }

  const invoices = await tx.invoice.findMany({
    where: {
      tenancyId: params.tenancyId,
      id: { in: [...requested.keys()] },
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    select: { id: true, totalPaise: true, amountPaidPaise: true },
  });

  if (invoices.length !== requested.size) {
    throw new AppError('INVOICE_NOT_PAYABLE', 'One of the selected bills is already settled.');
  }

  const applications = invoices.map((invoice) => {
    const outstanding = Math.max(0, invoice.totalPaise - invoice.amountPaidPaise);
    const amountPaise = requested.get(invoice.id) ?? 0;
    if (amountPaise <= 0 || amountPaise > outstanding) {
      throw new AppError(
        'VALIDATION_FAILED',
        `An amount is more than what is still owed (${formatINR(outstanding, { withPaise: false })}).`,
      );
    }
    return { invoiceId: invoice.id, amountPaise };
  });

  const amountPaise = sumPaise(applications.map((application) => application.amountPaise));

  const payment = await tx.payment.create({
    data: {
      propertyId: params.propertyId,
      tenancyId: params.tenancyId,
      amountPaise,
      method: params.method,
      status: 'PAID',
      paidAt: toPrismaDate(params.paidOn),
      reference: params.reference ?? null,
      notes: params.notes ?? null,
      recordedByUserId: params.recordedByUserId ?? null,
      unallocatedPaise: 0,
      idempotencyKey: params.idempotencyKey ?? null,
    },
  });

  for (const application of applications) {
    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: application.invoiceId,
        amountPaise: application.amountPaise,
      },
    });

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: application.invoiceId },
      select: { amountPaidPaise: true },
    });

    await tx.invoice.update({
      where: { id: application.invoiceId },
      data: { amountPaidPaise: invoice.amountPaidPaise + application.amountPaise },
    });

    // Recompute after applying: settling the principal stops the late fee.
    await recomputeInvoice(tx, application.invoiceId, params.settings, params.today);
  }

  const tenancy = await tx.tenancy.findUniqueOrThrow({
    where: { id: params.tenancyId },
    include: {
      user: { select: { fullName: true } },
      property: { select: { name: true } },
      allocations: {
        where: { endedAt: null },
        include: { bed: { select: { room: { select: { number: true } } } } },
      },
    },
  });

  const settledInvoices = await tx.invoice.findMany({
    where: { id: { in: applications.map((application) => application.invoiceId) } },
    include: { items: true },
  });

  // One receipt per settled invoice, each a frozen snapshot of only its own
  // line items. Receipt numbers are gapless; each call advances the sequence by one.
  const receiptNumbers: string[] = [];
  for (const settledInvoice of settledInvoices) {
    const number = await nextReceiptNumber(tx, params.propertyId, params.paidOn);
    const application = applications.find((a) => a.invoiceId === settledInvoice.id);

    await tx.receipt.create({
      data: {
        paymentId: payment.id,
        invoiceId: settledInvoice.id,
        number,
        snapshot: {
          propertyName: tenancy.property.name,
          residentName: tenancy.user.fullName,
          roomNumber: tenancy.allocations[0]?.bed.room.number ?? null,
          periodKey: settledInvoice.periodKey ?? null,
          method: params.method,
          paidOn: params.paidOn,
          totalPaidPaise: application?.amountPaise ?? 0,
          unallocatedPaise: 0,
          lines: settledInvoice.items.map((item) => ({
            label: item.description,
            amountPaise: item.amountPaise,
          })),
        },
      },
    });

    receiptNumbers.push(number);
  }

  return { paymentId: payment.id, receiptNumbers, amountPaise };
}

// --- Owner: manual payments -------------------------------------------------

export interface RecordPaymentInput {
  tenancyId: string;
  /** How much of each selected bill this payment covers. */
  allocations: Array<{ invoiceId: string; amountPaise: number }>;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  paidAt: DateOnly;
  reference?: string | undefined;
  notes?: string | undefined;
  idempotencyKey?: string | undefined;
}

/**
 * Records a payment the owner received outside the app.
 *
 * Cash and direct UPI are the dominant real-world case, so this is a first-class
 * flow rather than an afterthought — and every one writes an audit entry naming
 * who keyed it in.
 */
export async function recordManualPayment(
  actor: Actor,
  input: RecordPaymentInput,
): Promise<PaymentView> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'payment:record');
  const today = todayInZone(timezone);

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: input.tenancyId, propertyId },
    include: { user: { select: { fullName: true } } },
  });
  if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');

  if (input.idempotencyKey !== undefined) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipts: { select: { number: true } }, tenancy: { include: { user: true } } },
    });
    // A double-submitted form returns the ORIGINAL payment rather than creating
    // a second one.
    if (existing !== null) return toPaymentView(existing, existing.tenancy.user.fullName);
  }

  const { paymentId, receiptNumbers, amountPaise } = await prisma.$transaction(async (tx) => {
    const result = await settlePayment(tx, {
      propertyId,
      tenancyId: input.tenancyId,
      allocations: input.allocations,
      method: input.method,
      paidOn: input.paidAt,
      settings,
      today,
      reference: input.reference,
      notes: input.notes,
      recordedByUserId: actor.userId,
      idempotencyKey: input.idempotencyKey,
    });

    await writeAudit(tx, {
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: result.paymentId,
      propertyId,
      summary: `₹${(result.amountPaise / 100).toFixed(2)} received from ${tenancy.user.fullName} via ${input.method} (receipt ${result.receiptNumbers[0] ?? ''})`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      after: {
        method: input.method,
        amountPaise: result.amountPaise,
        reference: input.reference ?? null,
      },
    });

    return result;
  });

  await notify({
    event: 'PAYMENT_RECEIVED',
    userId: tenancy.userId,
    dedupeKey: paymentId,
    params: { amountPaise, receiptNumber: receiptNumbers.join(', ') },
  });

  const created = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { receipts: { select: { number: true } } },
  });

  return toPaymentView(created, tenancy.user.fullName);
}

interface PaymentRecord {
  id: string;
  amountPaise: number;
  method: PaymentMethod;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  reference: string | null;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
  tenancyId: string;
  unallocatedPaise: number;
  receipts: Array<{ number: string }>;
}

function toPaymentView(payment: PaymentRecord, residentName: string): PaymentView {
  return {
    id: payment.id,
    amountPaise: payment.amountPaise,
    method: payment.method,
    status: payment.status,
    reference: payment.reference,
    notes: payment.notes,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    residentName,
    tenancyId: payment.tenancyId,
    receiptNumber: payment.receipts[0]?.number ?? null,
    unallocatedPaise: payment.unallocatedPaise,
  };
}

export async function listPayments(
  actor: Actor,
  filters: Loose<{ search: string }> = {},
): Promise<PaymentView[]> {
  const { propertyId } = await getPropertyContext(actor, 'payment:read');

  const payments = await prisma.payment.findMany({
    where: {
      propertyId,
      ...(filters.search === undefined || filters.search === ''
        ? {}
        : {
            tenancy: {
              user: { fullName: { contains: filters.search, mode: 'insensitive' as const } },
            },
          }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      receipts: { select: { number: true } },
      tenancy: { include: { user: { select: { fullName: true } } } },
    },
    take: 200,
  });

  return payments.map((payment) => toPaymentView(payment, payment.tenancy.user.fullName));
}

// --- Receipts ---------------------------------------------------------------

interface ReceiptSnapshot {
  propertyName: string;
  residentName: string;
  roomNumber: string | null;
  periodKey: string | null;
  method: PaymentMethod;
  totalPaidPaise: number;
  lines: Array<{ label: string; amountPaise: number }>;
}

export async function getReceipt(
  receiptId: string,
  scope: { propertyId?: string; tenancyId?: string },
): Promise<ReceiptView> {
  const receipt = await prisma.receipt.findFirst({
    where: {
      id: receiptId,
      payment: {
        ...(scope.propertyId === undefined ? {} : { propertyId: scope.propertyId }),
        ...(scope.tenancyId === undefined ? {} : { tenancyId: scope.tenancyId }),
      },
    },
  });

  if (receipt === null) throw new AppError('NOT_FOUND', 'Receipt not found.');

  const snapshot = receipt.snapshot as unknown as ReceiptSnapshot;

  return {
    id: receipt.id,
    number: receipt.number,
    issuedAt: receipt.issuedAt.toISOString(),
    propertyName: snapshot.propertyName,
    residentName: snapshot.residentName,
    roomNumber: snapshot.roomNumber,
    periodKey: snapshot.periodKey,
    method: snapshot.method,
    totalPaidPaise: snapshot.totalPaidPaise,
    lines: snapshot.lines,
  };
}

/** Sanity check used by tests: allocations must never exceed the payment. */
export function assertAllocationsBalance(
  amountPaise: number,
  allocations: readonly number[],
  unallocatedPaise: number,
): void {
  const total = sumPaise([...allocations, unallocatedPaise]);
  if (total !== amountPaise) {
    throw new AppError('INTERNAL_ERROR', 'Payment allocation does not balance.');
  }
}
