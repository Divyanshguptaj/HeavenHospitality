import type { PaymentView, ReceiptView } from '@heaven/contracts';
import { sumPaise } from '@heaven/money';
import type { PaymentMethod, PropertySettings } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';
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
import { notify } from '../notifications/notification.service.js';
import { getActiveTenancyForActor, getPropertyContext } from '../property/property.context.js';
import { paymentProvider } from './payment.provider.js';

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
 *
 * The amount is never accepted from a caller: it is the sum of exactly the
 * `targetInvoiceIds` invoices' outstanding balances, computed here inside the
 * transaction — so rent, the AC bill and the security deposit can each be
 * settled independently by selecting which of them a payment covers.
 */
async function settlePayment(
  tx: TransactionClient,
  params: {
    propertyId: string;
    tenancyId: string;
    targetInvoiceIds: readonly string[];
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
    /** What the provider actually captured. A mismatch with the invoices' current balance is refused, never settled. */
    expectedAmountPaise?: number | null | undefined;
  },
): Promise<{ paymentId: string; receiptNumbers: string[]; amountPaise: number }> {
  const outstanding = await tx.invoice.findMany({
    where: {
      tenancyId: params.tenancyId,
      id: { in: [...params.targetInvoiceIds] },
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    select: { id: true, dueDate: true, totalPaise: true, amountPaidPaise: true },
  });

  const payable = outstanding.map((invoice) => ({
    invoiceId: invoice.id,
    dueDate: fromPrismaDate(invoice.dueDate),
    outstandingPaise: Math.max(0, invoice.totalPaise - invoice.amountPaidPaise),
  }));

  const amountPaise = sumPaise(payable.map((invoice) => invoice.outstandingPaise));
  if (amountPaise <= 0) {
    throw new AppError('INVOICE_NOT_PAYABLE', 'The selected invoices are already settled.');
  }

  if (params.expectedAmountPaise != null && params.expectedAmountPaise !== amountPaise) {
    throw new AppError(
      'PAYMENT_VERIFICATION_FAILED',
      'The amount paid does not match what these invoices now total.',
    );
  }

  // Every invoice in the set is targeted, so this only decides the order the
  // (fully-covering) amount is written across them.
  const { applications, unallocatedPaise } = applyPaymentToInvoices(amountPaise, payable);

  const payment = await tx.payment.create({
    data: {
      propertyId: params.propertyId,
      tenancyId: params.tenancyId,
      amountPaise,
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

  // Issue one receipt per settled invoice — each carries a frozen snapshot of
  // only its own line items so a later upstream edit cannot change what was
  // printed on the receipt. Receipt numbers are gapless and sequential; each
  // call to nextReceiptNumber advances the sequence by exactly one.
  const receiptNumbers: string[] = [];
  for (const settledInvoice of settledInvoices) {
    const number = await nextReceiptNumber(tx, params.propertyId, params.paidOn);
    const application = applications.find((a) => a.invoiceId === settledInvoice.id);

    await tx.receipt.create({
      data: {
        paymentId: payment.id,
        invoiceId: settledInvoice.id,
        number,
        // A frozen copy: a later edit upstream must not change what an issued
        // receipt says. Lines are pulled from only this invoice so each receipt
        // reflects what was on that invoice, not a combined total.
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
  invoiceIds: string[];
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
      targetInvoiceIds: input.invoiceIds,
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

// --- Resident: online payment (Razorpay, or the mock stand-in) -------------

/**
 * Starts an online payment.
 *
 * The amount is read from the INVOICES, never accepted from the client — the
 * single most important rule in the payment flow. A resident may select any
 * one, any two, or all three of rent, the AC bill and the deposit; the order
 * covers exactly the sum of whichever they picked.
 */
export async function startOnlinePayment(
  actor: Actor,
  invoiceIds: string[],
): Promise<{
  orderId: string;
  amountPaise: number;
  currency: string;
  provider: string;
  keyId: string | null;
  mock: { providerPaymentId: string; signature: string } | null;
}> {
  const { tenancyId } = await getActiveTenancyForActor(actor);

  const invoices = await prisma.invoice.findMany({
    // Scoped to the caller's own tenancy: another resident's invoice id
    // simply does not resolve.
    where: { id: { in: invoiceIds }, tenancyId },
    select: { id: true, totalPaise: true, amountPaidPaise: true, status: true },
  });

  if (invoices.length !== invoiceIds.length) throw new AppError('NOT_FOUND', 'Invoice not found.');
  if (invoices.some((invoice) => invoice.status === 'PAID' || invoice.status === 'CANCELLED')) {
    throw new AppError('INVOICE_NOT_PAYABLE', 'One of the selected invoices is not payable.');
  }

  const payable = sumPaise(
    invoices.map((invoice) => Math.max(0, invoice.totalPaise - invoice.amountPaidPaise)),
  );
  if (payable <= 0) {
    throw new AppError('INVOICE_NOT_PAYABLE', 'The selected invoices are already settled.');
  }

  const order = await paymentProvider.createOrder({
    amountPaise: payable,
    invoiceIds,
  });

  return {
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    currency: order.currency,
    provider: order.provider,
    keyId: order.keyId,
    mock: order.mock ?? null,
  };
}

/**
 * Confirms an online payment, from the resident's own client callback.
 *
 * The provider — not this function — decides whether the signature is valid
 * and whether the payment actually settled; see `paymentProvider.verify`. A
 * webhook delivery for the same payment converges on the same
 * `providerPaymentId @unique` guard below, so whichever path arrives first
 * wins and the second is a no-op. See docs/0007-payments.md.
 */
export async function confirmOnlinePayment(
  actor: Actor,
  input: { orderId: string; providerPaymentId: string; signature: string; invoiceIds: string[] },
): Promise<{ receiptNumbers: string[] }> {
  const { tenancyId, propertyId, timezone, settings } = await getActiveTenancyForActor(actor);
  const today = todayInZone(timezone);

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: input.invoiceIds }, tenancyId },
    select: { id: true },
  });
  if (invoices.length !== input.invoiceIds.length)
    throw new AppError('NOT_FOUND', 'Invoice not found.');

  const confirmation = await paymentProvider.verify({
    orderId: input.orderId,
    providerPaymentId: input.providerPaymentId,
    signature: input.signature,
    invoiceIds: input.invoiceIds,
  });

  const existingReceipts = async (): Promise<string[] | null> => {
    const already = await prisma.payment.findUnique({
      where: { providerPaymentId: confirmation.providerPaymentId },
      include: { receipts: { select: { number: true } } },
    });
    return already === null ? null : already.receipts.map((r) => r.number);
  };

  // The provider payment id is unique, so a replayed confirmation cannot create
  // a second payment — the same guard a real webhook needs.
  const alreadyRecorded = await existingReceipts();
  if (alreadyRecorded !== null) return { receiptNumbers: alreadyRecorded };

  let result: Awaited<ReturnType<typeof settlePayment>>;
  try {
    result = await prisma.$transaction(async (tx) => {
      const settled = await settlePayment(tx, {
        propertyId,
        tenancyId,
        targetInvoiceIds: input.invoiceIds,
        method: 'ONLINE',
        paidOn: today,
        settings,
        today,
        provider: paymentProvider.name,
        providerOrderId: input.orderId,
        providerPaymentId: confirmation.providerPaymentId,
        expectedAmountPaise: confirmation.amountPaise,
      });

      await writeAudit(tx, {
        action: 'PAYMENT_CONFIRMED',
        entityType: 'Payment',
        entityId: settled.paymentId,
        propertyId,
        summary: `Online payment of ₹${(settled.amountPaise / 100).toFixed(2)} confirmed (receipts ${settled.receiptNumbers.join(', ')})`,
        actorUserId: actor.userId,
        actorRole: 'RESIDENT',
      });

      return settled;
    });
  } catch (error) {
    // The webhook for this same payment can commit between the check above and
    // this transaction. Whichever lost the race finds the winner's payment and
    // reports it as done, instead of surfacing a failure for money already taken.
    const winner = await existingReceipts();
    if (winner !== null) return { receiptNumbers: winner };
    throw error;
  }

  await notify({
    event: 'PAYMENT_RECEIVED',
    userId: actor.userId,
    dedupeKey: result.paymentId,
    params: { amountPaise: result.amountPaise, receiptNumber: result.receiptNumbers.join(', ') },
  });

  return { receiptNumbers: result.receiptNumbers };
}

/**
 * Confirms an online payment from Razorpay's webhook — the belt-and-suspenders
 * path that settles the invoice(s) even if the resident's app closes before
 * the client callback fires.
 *
 * No `Actor` here: a webhook carries no session. The tenancy and property are
 * resolved from the invoices themselves, whose ids the order's own `notes`
 * carried from the moment it was created — never from anything the request
 * claims. A duplicate delivery (Razorpay retries) or a payment already
 * settled via the client callback both converge on the same
 * `providerPaymentId @unique` guard and become a silent no-op. See
 * docs/0007-payments.md.
 */
export async function settleOnlinePaymentFromWebhook(input: {
  invoiceIds: string[];
  orderId: string;
  providerPaymentId: string;
  capturedAmountPaise: number;
}): Promise<void> {
  const already = await prisma.payment.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
  });
  if (already !== null) return;

  // Money Razorpay has already captured but this server cannot book — the
  // webhook is acknowledged (a retry would fail the same way) but never silent:
  // this line is what an owner reconciles or refunds from.
  const unreconciled = (reason: string): void => {
    logger.error(
      {
        reason,
        orderId: input.orderId,
        providerPaymentId: input.providerPaymentId,
        invoiceIds: input.invoiceIds,
        capturedAmountPaise: input.capturedAmountPaise,
      },
      'razorpay webhook: captured payment could not be settled — needs manual reconciliation',
    );
  };

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: input.invoiceIds } },
    select: {
      id: true,
      tenancyId: true,
      propertyId: true,
      totalPaise: true,
      amountPaidPaise: true,
      status: true,
    },
  });
  // Nothing sane to settle against — log and move on rather than throw, so
  // Razorpay does not retry a webhook that will never resolve.
  const first = invoices[0];
  if (first === undefined) return unreconciled('invoice not found');
  if (invoices.some((invoice) => invoice.status === 'PAID' || invoice.status === 'CANCELLED')) {
    return unreconciled('an invoice was already paid or cancelled');
  }

  const property = await prisma.property.findUnique({
    where: { id: first.propertyId },
    select: { timezone: true, settings: true },
  });
  if (property === null || property.settings === null)
    return unreconciled('property settings missing');

  const today = todayInZone(property.timezone);
  const payable = sumPaise(
    invoices.map((invoice) => Math.max(0, invoice.totalPaise - invoice.amountPaidPaise)),
  );
  if (payable <= 0) return unreconciled('nothing outstanding on the invoices');

  let settledPayment: Awaited<ReturnType<typeof settlePayment>>;
  try {
    settledPayment = await prisma.$transaction(async (tx) => {
      const settled = await settlePayment(tx, {
        propertyId: first.propertyId,
        tenancyId: first.tenancyId,
        targetInvoiceIds: input.invoiceIds,
        method: 'ONLINE',
        paidOn: today,
        settings: property.settings as PropertySettings,
        today,
        provider: 'razorpay',
        providerOrderId: input.orderId,
        providerPaymentId: input.providerPaymentId,
        expectedAmountPaise: input.capturedAmountPaise,
      });

      await writeAudit(tx, {
        action: 'PAYMENT_CONFIRMED',
        entityType: 'Payment',
        entityId: settled.paymentId,
        propertyId: first.propertyId,
        summary: `Online payment of ₹${(settled.amountPaise / 100).toFixed(2)} confirmed via webhook (receipts ${settled.receiptNumbers.join(', ')})`,
        actorRole: 'SYSTEM',
      });

      return settled;
    });
  } catch (error) {
    // The client callback for this same payment got there first — done.
    const winner = await prisma.payment.findUnique({
      where: { providerPaymentId: input.providerPaymentId },
    });
    if (winner !== null) return;
    // The amount no longer matches the invoices (paid in cash, a fee changed):
    // retrying cannot fix that, so record it for a human rather than loop.
    if (error instanceof AppError && error.code === 'PAYMENT_VERIFICATION_FAILED') {
      return unreconciled('captured amount does not match the invoices');
    }
    throw error;
  }

  const payer = await prisma.tenancy.findUnique({
    where: { id: first.tenancyId },
    select: { userId: true },
  });
  if (payer !== null) {
    await notify({
      event: 'PAYMENT_RECEIVED',
      userId: payer.userId,
      dedupeKey: settledPayment.paymentId,
      params: {
        amountPaise: settledPayment.amountPaise,
        receiptNumber: settledPayment.receiptNumbers.join(', '),
      },
    });
  }
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
