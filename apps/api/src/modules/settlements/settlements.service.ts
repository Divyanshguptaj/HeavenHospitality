import type { SettlementLineView, SettlementView } from '@heaven/contracts';
import { formatINR, sumPaise } from '@heaven/money';
import { Prisma } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import { writeAudit, type TransactionClient } from '../../lib/audit.js';
import { fiscalYearOf, periodLabel, todayInZone, toPrismaDate, type DateOnly } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { recomputeInvoice } from '../billing/invoice.service.js';
import { notify } from '../notifications/notification.service.js';
import { getPropertyContext } from '../property/property.context.js';

/**
 * Settling up: the manager forgives part of what a resident owes, in exchange for
 * something that is not money received.
 *
 * It is never a payment. No payment row is created, nothing is added to what a
 * bill has "paid", and so nothing counts as collected. It is recorded as a
 * negative line on the bill, which makes every balance in the app (the
 * Overview, the residents list, the resident's own screen, reminders and the
 * exit check) drop by itself, plus a receipt of its own.
 */

const SETTLEABLE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

type Category = 'RENT' | 'ELECTRICITY' | 'DEPOSIT';

export interface SettleableInvoice {
  readonly id: string;
  readonly number: string;
  readonly category: Category;
  readonly status: string;
  readonly periodKey: string;
  readonly amountPaidPaise: number;
  readonly items: ReadonlyArray<{ readonly kind: string; readonly amountPaise: number }>;
}

export interface RequestedLine {
  readonly invoiceId: string;
  readonly amountPaise: number;
  readonly lateFeePaise: number;
}

export interface PlannedLine {
  readonly invoice: SettleableInvoice;
  readonly amountPaise: number;
  readonly lateFeePaise: number;
}

/** What is still owed on the bill itself, not counting its late fee. */
export function outstandingPrincipal(invoice: SettleableInvoice): number {
  const principal = sumPaise(
    invoice.items.filter((item) => item.kind !== 'LATE_FEE').map((item) => item.amountPaise),
  );
  return Math.max(0, principal - invoice.amountPaidPaise);
}

/** The late fee the bill carries right now. */
export function currentLateFee(invoice: SettleableInvoice): number {
  return sumPaise(
    invoice.items.filter((item) => item.kind === 'LATE_FEE').map((item) => item.amountPaise),
  );
}

export function describeBill(invoice: Pick<SettleableInvoice, 'category' | 'periodKey'>): string {
  if (invoice.category === 'DEPOSIT') return 'Security deposit';
  const name = invoice.category === 'RENT' ? 'Rent' : 'Electricity';
  return `${name} — ${periodLabel(invoice.periodKey)}`;
}

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

/**
 * Checks what the manager asked to settle against what each bill still owes.
 *
 * Pure, so every rule can be tested without a database. The same checks run
 * again inside the transaction, after the bills are locked, so a stale screen
 * can never settle more than is owed.
 */
export function planSettlement(
  invoices: readonly SettleableInvoice[],
  requested: readonly RequestedLine[],
): PlannedLine[] {
  const seen = new Set<string>();
  const planned: PlannedLine[] = [];

  for (const line of requested) {
    if (seen.has(line.invoiceId)) {
      throw new AppError('VALIDATION_FAILED', 'The same bill is listed twice.');
    }
    seen.add(line.invoiceId);

    const invoice = invoices.find((candidate) => candidate.id === line.invoiceId);
    if (invoice === undefined) {
      throw new AppError('NOT_FOUND', 'One of the selected bills was not found for this resident.');
    }

    const label = describeBill(invoice);

    if (!(SETTLEABLE_STATUSES as readonly string[]).includes(invoice.status)) {
      throw new AppError('INVOICE_NOT_PAYABLE', `${label} has nothing left to settle.`);
    }

    if (line.amountPaise < 0 || line.lateFeePaise < 0) {
      throw new AppError('VALIDATION_FAILED', `${label}: an amount cannot be negative.`);
    }
    if (line.amountPaise === 0 && line.lateFeePaise === 0) continue;

    const owed = outstandingPrincipal(invoice);
    if (line.amountPaise > owed) {
      throw new AppError(
        'VALIDATION_FAILED',
        `${label}: the most you can settle is ${rupees(owed)}.`,
      );
    }

    if (line.lateFeePaise > 0) {
      if (invoice.category !== 'RENT') {
        throw new AppError('VALIDATION_FAILED', `${label}: only rent carries a late fee.`);
      }
      const fee = currentLateFee(invoice);
      if (line.lateFeePaise > fee) {
        throw new AppError(
          'VALIDATION_FAILED',
          `${label}: the late fee is ${rupees(fee)}, so that is the most you can forgive.`,
        );
      }
    }

    planned.push({ invoice, amountPaise: line.amountPaise, lateFeePaise: line.lateFeePaise });
  }

  if (planned.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Enter an amount to settle.');
  }

  return planned;
}

/**
 * The next gapless settlement number for a property and financial year.
 *
 * Its own series, so payment receipt numbers stay gapless and a settlement is
 * never mistaken for money received. The sequence row is locked for the rest of
 * the transaction, as payment receipts do.
 */
async function nextSettlementNumber(
  tx: TransactionClient,
  propertyId: string,
  on: DateOnly,
): Promise<string> {
  const fiscalYear = fiscalYearOf(on);

  await tx.settlementSequence.upsert({
    where: { propertyId_fiscalYear: { propertyId, fiscalYear } },
    update: {},
    create: { propertyId, fiscalYear, lastNumber: 0 },
  });

  const locked = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    SELECT "lastNumber" FROM "SettlementSequence"
     WHERE "propertyId" = ${propertyId}::uuid AND "fiscalYear" = ${fiscalYear}
     FOR UPDATE
  `;
  const next = (locked[0]?.lastNumber ?? 0) + 1;

  await tx.settlementSequence.update({
    where: { propertyId_fiscalYear: { propertyId, fiscalYear } },
    data: { lastNumber: next },
  });

  return `HH/S/${fiscalYear}/${String(next).padStart(4, '0')}`;
}

interface StoredSnapshot {
  propertyName: string;
  residentName: string;
  roomNumber: string | null;
  lines: SettlementLineView[];
}

export function toSettlementView(row: {
  id: string;
  number: string;
  createdAt: Date;
  settledPaise: number;
  lateFeeForgivenPaise: number;
  note: string;
  snapshot: Prisma.JsonValue;
}): SettlementView {
  const snapshot = row.snapshot as unknown as StoredSnapshot;
  return {
    id: row.id,
    number: row.number,
    issuedAt: row.createdAt.toISOString(),
    propertyName: snapshot.propertyName,
    residentName: snapshot.residentName,
    roomNumber: snapshot.roomNumber,
    settledPaise: row.settledPaise,
    lateFeeForgivenPaise: row.lateFeeForgivenPaise,
    totalPaise: row.settledPaise + row.lateFeeForgivenPaise,
    note: row.note,
    lines: snapshot.lines,
  };
}

export interface SettleBalanceInput {
  lines: RequestedLine[];
  note: string;
  idempotencyKey?: string | undefined;
}

/**
 * Forgives the chosen amounts on a resident's bills, in ONE transaction: the
 * bills are locked, every amount is checked again, the negative lines and the
 * receipt are written, and balances and late fees are recomputed. Nothing is
 * ever recorded as a payment.
 */
export async function settleBalance(
  actor: Actor,
  tenancyId: string,
  input: SettleBalanceInput,
): Promise<SettlementView> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'invoice:settle');
  const today = todayInZone(timezone);

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId },
    select: { id: true },
  });
  if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');

  if (input.idempotencyKey !== undefined) {
    // A double-submitted form returns the ORIGINAL settlement rather than
    // settling a second time.
    const existing = await prisma.settlement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing !== null) return toSettlementView(existing);
  }

  const run = async (): Promise<{ view: SettlementView; userId: string; total: number }> =>
    prisma.$transaction(async (tx) => {
      const ids = input.lines.map((line) => line.invoiceId);

      // Lock the bills first. A payment or another settlement on the same bill at
      // the same moment would otherwise both pass the "what is still owed" check.
      if (ids.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "Invoice"
           WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
             AND "tenancyId" = ${tenancyId}::uuid
           ORDER BY "id"
           FOR UPDATE
        `;
      }

      const invoices = await tx.invoice.findMany({
        where: { id: { in: ids }, tenancyId, propertyId },
        include: { items: true },
      });

      const planned = planSettlement(
        invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          category: invoice.category,
          status: invoice.status,
          periodKey: invoice.periodKey,
          amountPaidPaise: invoice.amountPaidPaise,
          items: invoice.items,
        })),
        input.lines,
      );

      const settledPaise = sumPaise(planned.map((line) => line.amountPaise));
      const lateFeeForgivenPaise = sumPaise(planned.map((line) => line.lateFeePaise));

      const detail = await tx.tenancy.findUniqueOrThrow({
        where: { id: tenancyId },
        include: {
          user: { select: { fullName: true } },
          property: { select: { name: true } },
          allocations: {
            where: { endedAt: null },
            include: { bed: { select: { room: { select: { number: true } } } } },
          },
        },
      });

      const number = await nextSettlementNumber(tx, propertyId, today);

      const lines: SettlementLineView[] = planned.map((line) => ({
        invoiceNumber: line.invoice.number,
        category: line.invoice.category,
        label: describeBill(line.invoice),
        amountPaise: line.amountPaise,
        lateFeePaise: line.lateFeePaise,
      }));

      const snapshot: StoredSnapshot = {
        propertyName: detail.property.name,
        residentName: detail.user.fullName,
        roomNumber: detail.allocations[0]?.bed.room.number ?? null,
        lines,
      };

      const settlement = await tx.settlement.create({
        data: {
          propertyId,
          tenancyId,
          number,
          settledPaise,
          lateFeeForgivenPaise,
          note: input.note,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          settledByUserId: actor.userId,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      for (const line of planned) {
        if (line.amountPaise > 0) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: line.invoice.id,
              kind: 'SETTLEMENT',
              description: 'Settled by manager',
              amountPaise: -line.amountPaise,
              sourceType: 'Settlement',
              sourceId: settlement.id,
            },
          });
        }

        await tx.invoice.update({
          where: { id: line.invoice.id },
          data: {
            lateFeeForgivenPaise: { increment: line.lateFeePaise },
            settledOn: toPrismaDate(today),
          },
        });

        // A settled deposit was never collected, so the deposit held comes down by the same amount.
        if (line.invoice.category === 'DEPOSIT' && line.amountPaise > 0) {
          const held = await tx.tenancy.findUniqueOrThrow({
            where: { id: tenancyId },
            select: { securityDepositPaise: true },
          });
          await tx.tenancy.update({
            where: { id: tenancyId },
            data: { securityDepositPaise: Math.max(0, held.securityDepositPaise - line.amountPaise) },
          });
        }

        await recomputeInvoice(tx, line.invoice.id, settings, today);
      }

      const total = settledPaise + lateFeeForgivenPaise;

      await writeAudit(tx, {
        action: 'BALANCE_SETTLED',
        entityType: 'Settlement',
        entityId: settlement.id,
        propertyId,
        summary: `${rupees(total)} settled for ${detail.user.fullName} (${number})`,
        actorUserId: actor.userId,
        actorRole: 'ADMIN',
        after: {
          settledPaise,
          lateFeeForgivenPaise,
          note: input.note,
          bills: lines.map((entry) => entry.invoiceNumber),
        },
      });

      return { view: toSettlementView(settlement), userId: detail.userId, total };
    });

  let result: { view: SettlementView; userId: string; total: number };
  try {
    result = await run();
  } catch (error) {
    // Two identical submissions racing: the loser hits the unique key and gets the winner's receipt.
    if (
      input.idempotencyKey !== undefined &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.settlement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing !== null) return toSettlementView(existing);
    }
    throw error;
  }

  await notify({
    event: 'BALANCE_SETTLED',
    userId: result.userId,
    dedupeKey: result.view.id,
    params: { amountPaise: result.total, receiptNumber: result.view.number },
  });

  return result.view;
}

/** The owner's view of one resident's settlements, newest first. */
export async function listSettlementsForTenancy(
  actor: Actor,
  tenancyId: string,
): Promise<SettlementView[]> {
  const { propertyId } = await getPropertyContext(actor, 'resident:read');

  const rows = await prisma.settlement.findMany({
    where: { tenancyId, propertyId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toSettlementView);
}

/** A resident's own settlements. Scoped to their stay; another resident's are never visible. */
export async function listSettlementsForResident(tenancyId: string): Promise<SettlementView[]> {
  const rows = await prisma.settlement.findMany({
    where: { tenancyId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toSettlementView);
}

export async function getSettlementForTenancy(
  settlementId: string,
  tenancyId: string,
): Promise<SettlementView> {
  const row = await prisma.settlement.findFirst({ where: { id: settlementId, tenancyId } });
  if (row === null) throw new AppError('NOT_FOUND', 'Settlement not found.');
  return toSettlementView(row);
}
