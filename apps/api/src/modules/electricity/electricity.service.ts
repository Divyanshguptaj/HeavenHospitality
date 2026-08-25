import type { MeterReadingView } from '@heaven/contracts';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit } from '../../lib/audit.js';
import {
  fromPrismaDate,
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
      actorRole: 'OWNER',
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
 * Adds (or refreshes) the electricity line on any invoice already issued for the
 * period, so a reading entered after invoicing is not silently lost.
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

  const { recomputeInvoice } = await import('../billing/invoice.service.js');

  for (const share of shares) {
    const invoice = await prisma.invoice.findUnique({
      where: { tenancyId_periodKey: { tenancyId: share.tenancyId, periodKey } },
      select: { id: true, status: true },
    });

    if (invoice === null || invoice.status === 'CANCELLED') continue;

    const description = `Electricity — room ${share.reading.room.number}, ${share.reading.units} units @ ₹${(share.reading.ratePaisePerUnit / 100).toFixed(2)}/unit`;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.invoiceItem.findFirst({
        where: { invoiceId: invoice.id, kind: 'ELECTRICITY' },
      });

      if (existing === undefined || existing === null) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            kind: 'ELECTRICITY',
            description,
            amountPaise: share.sharePaise,
            sourceType: 'ElectricityShare',
            sourceId: share.id,
          },
        });
      } else {
        await tx.invoiceItem.update({
          where: { id: existing.id },
          data: { description, amountPaise: share.sharePaise, sourceId: share.id },
        });
      }

      await recomputeInvoice(tx, invoice.id, settings, today);
    });
  }
}
