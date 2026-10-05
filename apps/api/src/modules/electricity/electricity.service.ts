import type { MeterReadingView } from '@heaven/contracts';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit } from '../../lib/audit.js';
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
import { calculateElectricity, splitElectricity } from '../billing/billing.calculations.js';

/**
 * Electricity metering.
 *
 * The owner enters two numbers; the SERVER does the arithmetic (spec §11). The
 * rate in force is snapshot onto the reading, so changing the setting next month
 * never rewrites a bill that has already been issued.
 */

const READING_INCLUDE = {
  room: { select: { number: true } },
  shares: { include: { tenancy: { include: { user: { select: { fullName: true } } } } } },
} as const;

type ReadingRecord = Awaited<
  ReturnType<typeof prisma.meterReading.findFirstOrThrow<{ include: typeof READING_INCLUDE }>>
>;

function toView(reading: ReadingRecord): MeterReadingView {
  return {
    id: reading.id,
    roomId: reading.roomId,
    roomNumber: reading.room.number,
    periodKey: reading.periodKey,
    previousReading: reading.previousReading,
    currentReading: reading.currentReading,
    units: reading.units,
    ratePaisePerUnit: reading.ratePaisePerUnit,
    amountPaise: reading.amountPaise,
    readingDate: fromPrismaDate(reading.readingDate),
    status: reading.status,
    shares: reading.shares.map((share) => ({
      tenancyId: share.tenancyId,
      residentName: share.tenancy.user.fullName,
      sharePaise: share.sharePaise,
      occupiedDays: share.occupiedDays,
    })),
  };
}

export async function listReadings(
  actor: Actor,
  filters: Loose<{ periodKey: string; roomId: string }> = {},
): Promise<MeterReadingView[]> {
  const { propertyId } = await getPropertyContext(actor, 'electricity:read');

  const readings = await prisma.meterReading.findMany({
    where: {
      propertyId,
      ...(filters.periodKey === undefined ? {} : { periodKey: filters.periodKey }),
      ...(filters.roomId === undefined ? {} : { roomId: filters.roomId }),
    },
    orderBy: [{ periodKey: 'desc' }, { createdAt: 'desc' }],
    include: READING_INCLUDE,
  });

  return readings.map(toView);
}

/**
 * The last reading for a room, so the form can pre-fill "previous".
 *
 * Pre-filling matters: re-typing the previous number is the most likely place
 * for a transcription error, and an error there silently mis-bills everyone in
 * the room.
 */
export async function getLastReadingForRoom(
  actor: Actor,
  roomId: string,
): Promise<{ currentReading: number; periodKey: string; readingDate: DateOnly } | null> {
  const { propertyId } = await getPropertyContext(actor, 'electricity:read');

  const last = await prisma.meterReading.findFirst({
    where: { propertyId, roomId, status: 'ACTIVE' },
    orderBy: { periodKey: 'desc' },
    select: { currentReading: true, periodKey: true, readingDate: true },
  });

  if (last === null) return null;

  return {
    currentReading: last.currentReading,
    periodKey: last.periodKey,
    readingDate: fromPrismaDate(last.readingDate),
  };
}

export interface CreateReadingInput {
  roomId: string;
  periodKey: PeriodKey;
  previousReading: number;
  currentReading: number;
  readingDate: DateOnly;
  notes?: string | undefined;
}

/**
 * Records a reading and splits the resulting charge across the room's residents.
 *
 * A reading for a period that already has one is treated as a CORRECTION: the
 * old row is superseded rather than overwritten, so the original figures survive
 * for anyone who asks why their bill changed (spec §26).
 */
export async function recordReading(
  actor: Actor,
  input: CreateReadingInput,
): Promise<MeterReadingView> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'electricity:write');

  const room = await prisma.room.findFirst({
    where: { id: input.roomId, propertyId },
    select: { id: true, number: true },
  });
  if (room === null) throw new AppError('NOT_FOUND', 'Room not found.');

  if (input.currentReading < input.previousReading) {
    throw new AppError(
      'READING_BELOW_PREVIOUS',
      'The current reading is lower than the previous one. Check the numbers, or record a meter replacement.',
    );
  }

  const { units, amountPaise } = calculateElectricity({
    previousReading: input.previousReading,
    currentReading: input.currentReading,
    // Snapshot: this reading keeps the rate that applied when it was taken.
    ratePaisePerUnit: settings.electricityRatePaisePerUnit,
  });

  // Everyone who occupied the room at any point during the period shares the
  // bill, weighted by how long they were there.
  const allocations = await prisma.allocation.findMany({
    where: {
      bed: { roomId: input.roomId },
      startedAt: { lte: toPrismaDate(`${input.periodKey}-28`) },
      OR: [{ endedAt: null }, { endedAt: { gte: toPrismaDate(`${input.periodKey}-01`) } }],
    },
    select: { tenancyId: true, startedAt: true, endedAt: true },
  });

  const readingId = await prisma.$transaction(async (tx) => {
    const existing = await tx.meterReading.findFirst({
      where: { roomId: input.roomId, periodKey: input.periodKey, status: 'ACTIVE' },
      select: { id: true },
    });

    if (existing !== null) {
      // Free the "one ACTIVE reading per room per period" slot before inserting
      // the replacement, and keep the superseded row for the audit trail.
      await tx.meterReading.update({
        where: { id: existing.id },
        data: { status: 'CORRECTED' },
      });
    }

    const reading = await tx.meterReading.create({
      data: {
        propertyId,
        roomId: input.roomId,
        periodKey: input.periodKey,
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        units,
        ratePaisePerUnit: settings.electricityRatePaisePerUnit,
        amountPaise,
        readingDate: toPrismaDate(input.readingDate),
        notes: input.notes ?? null,
        recordedByUserId: actor.userId,
      },
    });

    if (existing !== null) {
      await tx.meterReading.update({
        where: { id: existing.id },
        data: { correctedByReadingId: reading.id },
      });
    }

    const shares = splitElectricity(
      amountPaise,
      input.periodKey,
      allocations.map((allocation) => ({
        tenancyId: allocation.tenancyId,
        startedOn: fromPrismaDate(allocation.startedAt),
        endedOn: allocation.endedAt === null ? null : fromPrismaDate(allocation.endedAt),
      })),
    );

    for (const share of shares) {
      await tx.electricityShare.create({
        data: {
          readingId: reading.id,
          tenancyId: share.tenancyId,
          sharePaise: share.sharePaise,
          occupiedDays: share.occupiedDays,
        },
      });
    }

    await writeAudit(tx, {
      action: existing === null ? 'ELECTRICITY_READING_ADDED' : 'ELECTRICITY_READING_CORRECTED',
      entityType: 'MeterReading',
      entityId: reading.id,
      propertyId,
      summary:
        `Room ${room.number} ${input.periodKey}: ${units} units = ₹${(amountPaise / 100).toFixed(2)}` +
        (existing === null ? '' : ' (corrected)'),
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      after: {
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        units,
        ratePaisePerUnit: settings.electricityRatePaisePerUnit,
      },
    });

    return reading.id;
  });

  // A reading taken after invoices were issued must reach those invoices, or the
  // owner would have to reissue by hand.
  await attachSharesToInvoices(propertyId, input.periodKey, todayInZone(timezone));

  const created = await prisma.meterReading.findUniqueOrThrow({
    where: { id: readingId },
    include: READING_INCLUDE,
  });
  return toView(created);
}

/**
 * Adds (or refreshes) the electricity line on that tenancy's ELECTRICITY
 * invoice for the period, so a reading entered after rent was already
 * invoiced is not silently lost. Electricity is billed on its own invoice
 * (see the `InvoiceCategory` split in invoice.service.ts), so when nothing has
 * been raised for it yet this raises it now, rather than requiring one to
 * already exist.
 */
async function attachSharesToInvoices(
  propertyId: string,
  periodKey: PeriodKey,
  today: DateOnly,
): Promise<void> {
  const settings = await prisma.propertySettings.findUniqueOrThrow({ where: { propertyId } });

  const shares = await prisma.electricityShare.findMany({
    where: { reading: { propertyId, periodKey, status: 'ACTIVE' } },
    include: {
      reading: {
        select: { units: true, ratePaisePerUnit: true, room: { select: { number: true } } },
      },
    },
  });
  if (shares.length === 0) return;

  const { recomputeInvoice } = await import('../billing/invoice.service.js');

  // Everything below used to be one query at a time, per resident in the room —
  // each a separate transaction. Against Neon's per-round-trip latency that
  // made a 4-resident room take 30+ seconds, long enough to hit the mobile
  // client's own timeout. Batching the lookups (one findMany instead of N
  // findUniques) and doing the whole attach as ONE transaction instead of N
  // brings a room of any size down to a small, constant number of round trips.
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      tenancyId: { in: shares.map((share) => share.tenancyId) },
      periodKey,
      category: 'ELECTRICITY',
    },
    select: { id: true, tenancyId: true, status: true },
  });
  const invoiceByTenancy = new Map(existingInvoices.map((invoice) => [invoice.tenancyId, invoice]));

  const tenanciesNeedingInvoice = shares.filter(
    (share) => invoiceByTenancy.get(share.tenancyId) === undefined,
  );
  const tenancyNames =
    tenanciesNeedingInvoice.length === 0
      ? []
      : await prisma.tenancy.findMany({
          where: { id: { in: tenanciesNeedingInvoice.map((share) => share.tenancyId) } },
          select: { id: true, user: { select: { fullName: true } } },
        });
  const nameByTenancy = new Map(tenancyNames.map((tenancy) => [tenancy.id, tenancy.user.fullName]));

  const sequenceStart =
    tenanciesNeedingInvoice.length === 0
      ? 0
      : await prisma.invoice.count({ where: { propertyId, periodKey } });

  await prisma.$transaction(async (tx) => {
    let nextSequence = sequenceStart;

    for (const share of shares) {
      const invoice = invoiceByTenancy.get(share.tenancyId);
      if (invoice !== undefined && invoice.status === 'CANCELLED') continue;

      const description = `Electricity — room ${share.reading.room.number}, ${share.reading.units} units @ ₹${(share.reading.ratePaisePerUnit / 100).toFixed(2)}/unit`;
      let invoiceId = invoice?.id;

      if (invoiceId === undefined) {
        nextSequence += 1;
        const number = `INV-ELEC-${periodKey.replace('-', '')}-${String(nextSequence).padStart(4, '0')}`;

        const created = await tx.invoice.create({
          data: {
            propertyId,
            tenancyId: share.tenancyId,
            periodKey,
            category: 'ELECTRICITY',
            number,
            status: 'ISSUED',
            issueDate: toPrismaDate(firstDayOfPeriod(periodKey)),
            // A reading is usually entered well into the month — giving this
            // the calendar due date directly would make the invoice born
            // already overdue, with a late fee attached the instant it's
            // created. Never earlier than today plus the normal grace period.
            dueDate: toPrismaDate(
              maxDate(dueDateFor(periodKey, settings.rentDueDay), addDays(today, settings.graceDays)),
            ),
            items: {
              create: [
                {
                  kind: 'ELECTRICITY',
                  description,
                  amountPaise: share.sharePaise,
                  sourceType: 'ElectricityShare',
                  sourceId: share.id,
                },
              ],
            },
          },
        });
        invoiceId = created.id;

        await writeAudit(tx, {
          action: 'INVOICE_ISSUED',
          entityType: 'Invoice',
          entityId: invoiceId,
          propertyId,
          summary: `Invoice ${number} issued to ${nameByTenancy.get(share.tenancyId) ?? 'resident'} for ${periodKey}`,
          actorRole: 'SYSTEM',
        });
      } else {
        const existingItem = await tx.invoiceItem.findFirst({
          where: { invoiceId, kind: 'ELECTRICITY' },
        });

        if (existingItem === null) {
          await tx.invoiceItem.create({
            data: {
              invoiceId,
              kind: 'ELECTRICITY',
              description,
              amountPaise: share.sharePaise,
              sourceType: 'ElectricityShare',
              sourceId: share.id,
            },
          });
        } else {
          await tx.invoiceItem.update({
            where: { id: existingItem.id },
            data: { description, amountPaise: share.sharePaise, sourceId: share.id },
          });
        }
      }

      await recomputeInvoice(tx, invoiceId, settings, today);
    }
    // Explicit headroom: this transaction covers every resident in the room,
    // and against this database's per-query latency that can genuinely take
    // longer than Prisma's 20s default — which doesn't fail gracefully, it
    // kills the whole transaction and rolls back EVERY resident's share, not
    // just the slow one. See the mirror comment on prisma.ts for payments.
  }, { timeout: 60_000, maxWait: 15_000 });
}

export interface RecordElectricityBillInput {
  roomId: string;
  periodKey: PeriodKey;
  entries: ReadonlyArray<{ tenancyId: string; amountPaise: number }>;
  notes?: string | undefined;
}

/**
 * Records the electricity/AC bill for a room, one amount per resident,
 * entered directly by the admin — no meter reading, no automatic split. The
 * admin decides what each person owes; this only writes it to their invoice.
 *
 * Unlike rent and most other invoicing here, this is ADDITIVE: every
 * submission writes a NEW line item rather than overwriting one, so billing
 * a room twice in a month (say, a mid-month top-up) charges for both — it
 * never erases what was already billed. Each line is its own row, so the
 * resident can see every individual charge that made up their total.
 */
export async function recordElectricityBill(
  actor: Actor,
  input: RecordElectricityBillInput,
): Promise<{ updated: number }> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'electricity:write');
  const today = todayInZone(timezone);

  const room = await prisma.room.findFirst({
    where: { id: input.roomId, propertyId },
    select: { number: true },
  });
  if (room === null) throw new AppError('NOT_FOUND', 'Room not found.');

  const tenancyIds = input.entries.map((entry) => entry.tenancyId);
  const tenancies = await prisma.tenancy.findMany({
    where: { id: { in: tenancyIds }, propertyId },
    select: { id: true, user: { select: { fullName: true } } },
  });
  if (tenancies.length !== new Set(tenancyIds).size) {
    throw new AppError('NOT_FOUND', 'One of the selected residents was not found.');
  }
  const nameByTenancy = new Map(tenancies.map((tenancy) => [tenancy.id, tenancy.user.fullName]));

  const existingInvoices = await prisma.invoice.findMany({
    where: { tenancyId: { in: tenancyIds }, periodKey: input.periodKey, category: 'ELECTRICITY' },
    select: { id: true, tenancyId: true, status: true },
  });
  const invoiceByTenancy = new Map(existingInvoices.map((invoice) => [invoice.tenancyId, invoice]));

  const tenanciesNeedingInvoice = input.entries.filter(
    (entry) => invoiceByTenancy.get(entry.tenancyId) === undefined,
  );
  const sequenceStart =
    tenanciesNeedingInvoice.length === 0
      ? 0
      : await prisma.invoice.count({ where: { propertyId, periodKey: input.periodKey } });

  const { recomputeInvoice } = await import('../billing/invoice.service.js');

  let updated = 0;
  let totalPaise = 0;

  // One transaction for the whole room, with explicit headroom — see the
  // mirror comment on attachSharesToInvoices for why the 20s default isn't
  // enough here and what it does to fail silently if left at that.
  await prisma.$transaction(
    async (tx) => {
      let nextSequence = sequenceStart;

      for (const entry of input.entries) {
        if (entry.amountPaise <= 0) continue;
        const existing = invoiceByTenancy.get(entry.tenancyId);
        if (existing !== undefined && existing.status === 'CANCELLED') continue;

        const description =
          `Electricity — room ${room.number}, added ${today}` +
          (input.notes === undefined ? '' : ` (${input.notes})`);
        let invoiceId = existing?.id;

        if (invoiceId === undefined) {
          nextSequence += 1;
          const number = `INV-ELEC-${input.periodKey.replace('-', '')}-${String(nextSequence).padStart(4, '0')}`;
          const dueDate = maxDate(
            dueDateFor(input.periodKey, settings.rentDueDay),
            addDays(today, settings.graceDays),
          );

          const created = await tx.invoice.create({
            data: {
              propertyId,
              tenancyId: entry.tenancyId,
              periodKey: input.periodKey,
              category: 'ELECTRICITY',
              number,
              status: 'ISSUED',
              issueDate: toPrismaDate(firstDayOfPeriod(input.periodKey)),
              dueDate: toPrismaDate(dueDate),
              items: {
                create: [{ kind: 'ELECTRICITY', description, amountPaise: entry.amountPaise }],
              },
            },
          });
          invoiceId = created.id;

          await writeAudit(tx, {
            action: 'INVOICE_ISSUED',
            entityType: 'Invoice',
            entityId: invoiceId,
            propertyId,
            summary: `Invoice ${number} issued to ${nameByTenancy.get(entry.tenancyId) ?? 'resident'} for ${input.periodKey}`,
            actorUserId: actor.userId,
            actorRole: 'ADMIN',
          });
        } else {
          // Additive: a new line, never overwriting whatever was billed before.
          await tx.invoiceItem.create({
            data: { invoiceId, kind: 'ELECTRICITY', description, amountPaise: entry.amountPaise },
          });
        }

        await recomputeInvoice(tx, invoiceId, settings, today);
        updated += 1;
        totalPaise += entry.amountPaise;
      }

      if (updated > 0) {
        await writeAudit(tx, {
          action: 'ELECTRICITY_READING_ADDED',
          entityType: 'Room',
          entityId: input.roomId,
          propertyId,
          summary:
            `Room ${room.number} electricity bill for ${input.periodKey}: ${updated} resident(s), ` +
            `₹${(totalPaise / 100).toFixed(2)} total` +
            (input.notes === undefined ? '' : ` — ${input.notes}`),
          actorUserId: actor.userId,
          actorRole: 'ADMIN',
        });
      }
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  if (updated === 0) {
    throw new AppError('VALIDATION_FAILED', 'Enter an amount for at least one resident.');
  }

  return { updated };
}

/**
 * Edits one resident's electricity/AC bill amount directly, after it was
 * first entered by `recordElectricityBill`.
 */
export async function updateElectricityInvoiceItem(
  actor: Actor,
  invoiceId: string,
  input: { amountPaise: number },
): Promise<{ updated: true }> {
  const { propertyId, timezone, settings } = await getPropertyContext(actor, 'electricity:write');
  const today = todayInZone(timezone);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId, category: 'ELECTRICITY' },
    include: {
      items: { where: { kind: 'ELECTRICITY' } },
      tenancy: { select: { user: { select: { fullName: true } } } },
    },
  });
  if (invoice === null) throw new AppError('NOT_FOUND', 'Electricity bill not found.');

  const item = invoice.items[0];
  if (item === undefined) throw new AppError('NOT_FOUND', 'Electricity bill not found.');

  const { recomputeInvoice } = await import('../billing/invoice.service.js');

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.update({ where: { id: item.id }, data: { amountPaise: input.amountPaise } });
    await recomputeInvoice(tx, invoiceId, settings, today);

    await writeAudit(tx, {
      action: 'ELECTRICITY_READING_CORRECTED',
      entityType: 'Invoice',
      entityId: invoiceId,
      propertyId,
      summary: `${invoice.tenancy.user.fullName}'s electricity bill for ${invoice.periodKey} changed to ₹${(input.amountPaise / 100).toFixed(2)}`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      before: { amountPaise: item.amountPaise },
      after: { amountPaise: input.amountPaise },
    });
  });

  return { updated: true };
}

/**
 * Manually corrects one resident's share of a room's electricity bill.
 *
 * The even/prorated split from `recordReading` is a starting point, not the
 * final word — an owner who knows one resident actually ran the AC far more
 * (or far less) than their roommates needs to be able to say so. Reuses
 * `attachSharesToInvoices` to push the correction onto an already-issued
 * invoice rather than leaving the two out of sync.
 */
export async function updateElectricityShare(
  actor: Actor,
  shareId: string,
  input: { sharePaise: number },
): Promise<{ updated: true }> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'electricity:write');

  const share = await prisma.electricityShare.findFirst({
    where: { id: shareId, reading: { propertyId } },
    select: {
      id: true,
      sharePaise: true,
      reading: { select: { periodKey: true } },
      tenancy: { select: { user: { select: { fullName: true } } } },
    },
  });
  if (share === null) throw new AppError('NOT_FOUND', 'Electricity share not found.');

  await prisma.$transaction(async (tx) => {
    await tx.electricityShare.update({
      where: { id: shareId },
      data: { sharePaise: input.sharePaise },
    });

    await writeAudit(tx, {
      action: 'ELECTRICITY_READING_CORRECTED',
      entityType: 'ElectricityShare',
      entityId: shareId,
      propertyId,
      summary: `${share.tenancy.user.fullName}'s electricity share for ${share.reading.periodKey} changed to ₹${(input.sharePaise / 100).toFixed(2)}`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      before: { sharePaise: share.sharePaise },
      after: { sharePaise: input.sharePaise },
    });
  });

  await attachSharesToInvoices(propertyId, share.reading.periodKey, todayInZone(timezone));

  return { updated: true };
}
