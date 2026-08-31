import type { PaymentView, ReceiptView } from '@heaven/contracts';
import { sumPaise } from '@heaven/money';
import type { PaymentMethod, PropertySettings } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import {
  fiscalYearOf,
  fromPrismaDate,
  todayInZone,
  toPrismaDate,
  type DateOnly,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { applyPaymentToInvoices } from '../billing/billing.calculations.js';
import { recomputeInvoice } from '../billing/invoice.service.js';
import { getActiveTenancyForActor, getPropertyContext } from '../property/property.context.js';
import { expectedTokenFor, paymentProvider, tokensMatch } from './payment.provider.js';

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
 * receipt — all in ONE transaction.
 *
 * A payment without a receipt, or an invoice whose paid amount disagrees with
 * the payments against it, must not be able to exist even for an instant.
 */
async function settlePayment(
  tx: TransactionClient,
  params: {
    propertyId: string;
    tenancyId: string;
    amountPaise: number;
    method: PaymentMethod;
    paidOn: DateOnly;
    settings: PropertySettings;
    today: DateOnly;
    provider?: string | undefined;
    providerOrderId?: string | undefined;
    providerPaymentId?: string | undefined;
    reference?: string | undefined;
    notes?: string | undefined;
    recordedByUserId?: string | undefined;
    idempotencyKey?: string | undefined;
    /** When set, the payment is applied to this invoice before any other. */
    preferredInvoiceId?: string | undefined;
  },
): Promise<{ paymentId: string; receiptNumber: string }> {
  const outstanding = await tx.invoice.findMany({
    where: {
      tenancyId: params.tenancyId,
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    select: { id: true, dueDate: true, totalPaise: true, amountPaidPaise: true },
  });

  const payable = outstanding.map((invoice) => ({
    invoiceId: invoice.id,
    dueDate: fromPrismaDate(invoice.dueDate),
    outstandingPaise: Math.max(0, invoice.totalPaise - invoice.amountPaidPaise),
  }));

  // Ordering is the calculation's job — doing it here as well meant the sort
  // inside applyPaymentToInvoices silently undid it.
  const { applications, unallocatedPaise } = applyPaymentToInvoices(
    params.amountPaise,
    payable,
    params.preferredInvoiceId,
  );

  const payment = await tx.payment.create({
    data: {
      propertyId: params.propertyId,
      tenancyId: params.tenancyId,
      amountPaise: params.amountPaise,
      method: params.method,
      status: 'PAID',
      paidAt: toPrismaDate(params.paidOn),
      provider: params.provider ?? null,
      providerOrderId: params.providerOrderId ?? null,
      providerPaymentId: params.providerPaymentId ?? null,
      reference: params.reference ?? null,
      notes: params.notes ?? null,
      recordedByUserId: params.recordedByUserId ?? null,
      unallocatedPaise,
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

  const number = await nextReceiptNumber(tx, params.propertyId, params.paidOn);

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

  const primaryInvoiceId = applications[0]?.invoiceId ?? null;
  const primaryInvoice =
    primaryInvoiceId === null
      ? null
      : await tx.invoice.findUnique({
          where: { id: primaryInvoiceId },
          include: { items: true },
        });

  await tx.receipt.create({
    data: {
      paymentId: payment.id,
      invoiceId: primaryInvoiceId,
      number,
      // A frozen copy: a later edit upstream must not change what an issued
      // receipt says.
      snapshot: {
        propertyName: tenancy.property.name,
        residentName: tenancy.user.fullName,
        roomNumber: tenancy.allocations[0]?.bed.room.number ?? null,
        periodKey: primaryInvoice?.periodKey ?? null,
        method: params.method,
        paidOn: params.paidOn,
        totalPaidPaise: params.amountPaise,
        unallocatedPaise,
        lines:
          primaryInvoice?.items.map((item) => ({
            label: item.description,
            amountPaise: item.amountPaise,
          })) ?? [],
      },
    },
  });

  return { paymentId: payment.id, receiptNumber: number };
}

// --- Owner: manual payments -------------------------------------------------

export interface RecordPaymentInput {
  tenancyId: string;
  invoiceId?: string | undefined;
  amountPaise: number;
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

  const { paymentId } = await prisma.$transaction(async (tx) => {
    const result = await settlePayment(tx, {
      propertyId,
      tenancyId: input.tenancyId,
      amountPaise: input.amountPaise,
      method: input.method,
      paidOn: input.paidAt,
      settings,
      today,
      reference: input.reference,
      notes: input.notes,
      recordedByUserId: actor.userId,
      idempotencyKey: input.idempotencyKey,
      preferredInvoiceId: input.invoiceId,
    });

    await writeAudit(tx, {
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: result.paymentId,
      propertyId,
      summary: `₹${(input.amountPaise / 100).toFixed(2)} received from ${tenancy.user.fullName} via ${input.method} (receipt ${result.receiptNumber})`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      after: {
        method: input.method,
        amountPaise: input.amountPaise,
        reference: input.reference ?? null,
      },
    });

    return result;
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

// --- Resident: mock online payment -----------------------------------------

/**
 * Starts an online payment.
 *
 * The amount is read from the INVOICE, never accepted from the client — the
 * single most important rule in the payment flow.
 */
export async function startOnlinePayment(
  actor: Actor,
  invoiceId: string,
): Promise<{ orderId: string; amountPaise: number; token: string; provider: string }> {
  const { tenancyId } = await getActiveTenancyForActor(actor);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenancyId },
    select: { id: true, totalPaise: true, amountPaidPaise: true, status: true },
  });

  // Scoped to the caller's own tenancy: another resident's invoice id simply
  // does not resolve.
  if (invoice === null) throw new AppError('NOT_FOUND', 'Invoice not found.');

  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
    throw new AppError('INVOICE_NOT_PAYABLE', 'This invoice is not payable.');
  }

  const payable = Math.max(0, invoice.totalPaise - invoice.amountPaidPaise);
  if (payable <= 0) {
    throw new AppError('INVOICE_NOT_PAYABLE', 'This invoice is already settled.');
  }

  const order = await paymentProvider.createOrder({
    amountPaise: payable,
    reference: invoice.id,
  });

  return {
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    token: order.token,
    provider: order.provider,
  };
}

/**
 * Confirms an online payment.
 *
 * The token is re-derived from the server's own view of the order and compared
 * in constant time. A client cannot invent a confirmation, and cannot replay one
 * order's token against a different invoice, because the amount and invoice id
 * are bound into the signature.
 */
export async function confirmOnlinePayment(
  actor: Actor,
  input: { orderId: string; mockToken: string; invoiceId: string },
): Promise<{ receiptNumber: string }> {
  const { tenancyId, propertyId, timezone, settings } = await getActiveTenancyForActor(actor);
  const today = todayInZone(timezone);

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenancyId },
    select: { id: true, totalPaise: true, amountPaidPaise: true, status: true },
  });
  if (invoice === null) throw new AppError('NOT_FOUND', 'Invoice not found.');

  const payable = Math.max(0, invoice.totalPaise - invoice.amountPaidPaise);

  const expected = expectedTokenFor({
    orderId: input.orderId,
    amountPaise: payable,
    reference: invoice.id,
  });

  if (!tokensMatch(input.mockToken, expected)) {
    throw new AppError(
      'PAYMENT_VERIFICATION_FAILED',
      'We could not verify that payment. Nothing has been charged.',
    );
  }

  const confirmation = await paymentProvider.verify({
    orderId: input.orderId,
    token: input.mockToken,
  });

  // The provider payment id is unique, so a replayed confirmation cannot create
  // a second payment — the same guard a real webhook needs.
  const already = await prisma.payment.findUnique({
    where: { providerPaymentId: confirmation.providerPaymentId },
    include: { receipts: { select: { number: true } } },
  });
  if (already !== null) {
    return { receiptNumber: already.receipts[0]?.number ?? '' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const settled = await settlePayment(tx, {
      propertyId,
      tenancyId,
      amountPaise: payable,
      method: 'ONLINE',
      paidOn: today,
      settings,
      today,
      provider: paymentProvider.name,
      providerOrderId: input.orderId,
      providerPaymentId: confirmation.providerPaymentId,
    });

    await writeAudit(tx, {
      action: 'PAYMENT_CONFIRMED',
      entityType: 'Payment',
      entityId: settled.paymentId,
      propertyId,
      summary: `Online payment of ₹${(payable / 100).toFixed(2)} confirmed (receipt ${settled.receiptNumber})`,
      actorUserId: actor.userId,
      actorRole: 'RESIDENT',
    });

    return settled;
  });

  return { receiptNumber: result.receiptNumber };
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
