import { Prisma } from '@prisma/client';
import cron from 'node-cron';

import {
  currentPeriodKey,
  firstDayOfPeriod,
  todayInZone,
  toPrismaDate,
  type DateOnly,
  type PeriodKey,
} from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from '../lib/audit.js';
import { generateInvoiceForTenancy, recomputeInvoice } from '../modules/billing/invoice.service.js';
import { notify, reconcilePushReceipts } from '../modules/notifications/notification.service.js';

/**
 * Scheduled work, running inside the API process.
 *
 * No Redis, no BullMQ, no worker service — at this scale a cron entry and an
 * idempotency row are the whole mechanism. See docs/0006-idempotency-and-jobs.md.
 */

const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * Runs a job at most once per (name, period).
 *
 * The INSERT *is* the lock: a second concurrent run loses the unique constraint
 * and exits. That keeps the job correct even if the deployment ever runs two
 * processes, without any coordination service.
 */
async function runOnce(
  jobName: string,
  periodKey: string,
  work: () => Promise<string>,
): Promise<void> {
  try {
    await prisma.jobRun.create({ data: { jobName, periodKey, status: 'RUNNING' } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION
    ) {
      // Already run (or running) for this period. Nothing to do.
      return;
    }
    throw error;
  }

  try {
    const summary = await work();
    await prisma.jobRun.update({
      where: { jobName_periodKey: { jobName, periodKey } },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    });
    logger.info({ jobName, periodKey }, summary);
  } catch (error) {
    await prisma.jobRun.update({
      where: { jobName_periodKey: { jobName, periodKey } },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        // Truncated: never a full stack trace or provider payload.
        error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
      },
    });
    logger.error({ jobName, periodKey, err: error }, 'Scheduled job failed');
  }
}

/**
 * Recomputes late fees on every unpaid invoice.
 *
 * Idempotent by construction: the fee is a pure function of the invoice, so
 * running this twice converges on the same number rather than charging twice.
 * A missed night self-heals on the next run.
 *
 * Each invoice gets its own transaction — one long transaction across hundreds
 * of invoices would exceed Prisma's timeout and roll the whole batch back.
 */
async function recomputeLateFees(today: DateOnly): Promise<string> {
  const properties = await prisma.property.findMany({
    where: { status: 'ACTIVE' },
    include: { settings: true },
  });

  let updated = 0;

  for (const property of properties) {
    if (property.settings === null) continue;

    const invoices = await prisma.invoice.findMany({
      where: {
        propertyId: property.id,
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: { id: true },
    });

    for (const invoice of invoices) {
      await prisma.$transaction(async (tx) => {
        await recomputeInvoice(tx, invoice.id, property.settings!, today);
      });
      updated += 1;
    }
  }

  return `Late fees recomputed for ${updated} invoice(s)`;
}

const DAY_MS = 86_400_000;

function monthLabel(periodKey: string): string {
  const [year, month] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Reminds residents about unpaid rent and AC bills.
 *
 * Rent and the AC bill are separate invoices for the same period, so they are
 * grouped per tenancy and period into ONE reminder for the combined balance.
 * The deposit is not rent and is never reminded about. Each reminder is
 * recorded once as a `ReminderEvent` (the owner's log) and delivered through
 * the notification service, whose own unique key stops any repeat send.
 *
 * Push 3 days before, push + WhatsApp on the due date, then push on overdue
 * days 1, 3, 7 and every 7th after, with WhatsApp only on day 3.
 */
async function createRentReminders(today: DateOnly): Promise<string> {
  const properties = await prisma.property.findMany({
    where: { status: 'ACTIVE' },
    include: { settings: true },
  });

  let created = 0;

  for (const property of properties) {
    if (property.settings === null) continue;

    const invoices = await prisma.invoice.findMany({
      where: {
        propertyId: property.id,
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        category: { not: 'DEPOSIT' },
      },
      include: { tenancy: { include: { user: { select: { id: true, fullName: true } } } } },
    });

    const groups = new Map<string, typeof invoices>();
    for (const invoice of invoices) {
      const key = `${invoice.tenancyId}:${invoice.periodKey}`;
      groups.set(key, [...(groups.get(key) ?? []), invoice]);
    }

    for (const group of groups.values()) {
      const first = group[0];
      if (first === undefined) continue;

      const outstanding = group.reduce(
        (sum, invoice) => sum + Math.max(0, invoice.totalPaise - invoice.amountPaidPaise),
        0,
      );
      if (outstanding <= 0) continue;

      const dueDate = group
        .map((invoice) => invoice.dueDate.toISOString().slice(0, 10))
        .sort()[0] as string;
      const daysUntil = (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
      const daysOverdue = -daysUntil;

      const kind = daysUntil > 0 ? 'BEFORE_DUE' : daysUntil === 0 ? 'ON_DUE' : 'AFTER_DUE';
      if (kind === 'BEFORE_DUE' && daysUntil > 3) continue;
      if (
        kind === 'AFTER_DUE' &&
        !(daysOverdue === 1 || daysOverdue === 3 || daysOverdue === 7 || daysOverdue % 7 === 0)
      ) {
        continue;
      }

      const name = first.tenancy.user.fullName;
      const month = monthLabel(first.periodKey);
      const logicalKey = `${first.tenancyId}:${first.periodKey}`;

      try {
        await prisma.reminderEvent.create({
          data: {
            propertyId: property.id,
            invoiceId: first.id,
            tenancyId: first.tenancyId,
            kind,
            channel: 'IN_APP',
            status: 'SENT',
            sentAt: new Date(),
            dedupeKey: `rent:${logicalKey}:${kind}`,
            message:
              `${name}: ₹${(outstanding / 100).toFixed(2)} for ${first.periodKey} ` +
              `${kind === 'AFTER_DUE' ? 'is overdue' : `is due on ${dueDate}`}.`,
          },
        });
        created += 1;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== PRISMA_UNIQUE_VIOLATION
        ) {
          throw error;
        }
      }

      const userId = first.tenancy.user.id;
      if (kind === 'BEFORE_DUE') {
        await notify({
          event: 'RENT_DUE_SOON',
          userId,
          dedupeKey: logicalKey,
          params: { name, month, amountPaise: outstanding, dueDate },
        });
      } else if (kind === 'ON_DUE') {
        await notify({
          event: 'RENT_DUE_TODAY',
          userId,
          dedupeKey: logicalKey,
          params: { name, month, amountPaise: outstanding, dueDate },
        });
      } else {
        await notify({
          event: 'RENT_OVERDUE',
          userId,
          dedupeKey: `${logicalKey}:d${daysOverdue}`,
          channels: daysOverdue === 3 ? ['PUSH', 'WHATSAPP'] : ['PUSH'],
          params: { name, month, amountPaise: outstanding, daysOverdue },
        });
      }
    }
  }

  return `Processed rent reminders, ${created} new`;
}

/**
 * Ends a stay whose notice period matured before this period began.
 *
 * Mirrors `exitResident`'s own rule: a resident who still owes rent is not
 * auto-vacated — RESIDENT standing is what keeps them collectible, so a
 * missed settlement leaves them ACTIVE/NOTICE_PERIOD (and billed again this
 * period) rather than quietly written off by a cron job.
 */
async function exitMaturedNotices(
  propertyId: string,
  periodKey: PeriodKey,
): Promise<{ exited: number; heldForDues: number }> {
  const tenancies = await prisma.tenancy.findMany({
    where: {
      propertyId,
      status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
      expectedExitDate: { not: null, lt: toPrismaDate(firstDayOfPeriod(periodKey)) },
    },
    include: {
      user: { select: { fullName: true } },
      allocations: { where: { endedAt: null } },
      invoices: { select: { totalPaise: true, amountPaidPaise: true, status: true } },
    },
  });

  let exited = 0;
  let heldForDues = 0;

  for (const tenancy of tenancies) {
    const outstanding = tenancy.invoices
      .filter((invoice) => invoice.status !== 'CANCELLED')
      .reduce((sum, invoice) => sum + Math.max(0, invoice.totalPaise - invoice.amountPaidPaise), 0);

    if (outstanding > 0) {
      heldForDues += 1;
      continue;
    }

    const exitDate = tenancy.expectedExitDate!;

    await prisma.$transaction(async (tx) => {
      for (const allocation of tenancy.allocations) {
        await tx.allocation.update({ where: { id: allocation.id }, data: { endedAt: exitDate } });
        await tx.bed.update({ where: { id: allocation.bedId }, data: { status: 'AVAILABLE' } });
      }

      await tx.tenancy.update({
        where: { id: tenancy.id },
        data: { status: 'VACATED', actualExitDate: exitDate },
      });

      const otherActiveTenancy = await tx.tenancy.findFirst({
        where: {
          userId: tenancy.userId,
          propertyId,
          id: { not: tenancy.id },
          status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
        },
        select: { id: true },
      });
      if (otherActiveTenancy === null) {
        await tx.propertyMembership.updateMany({
          where: { userId: tenancy.userId, propertyId, role: 'RESIDENT' },
          data: { role: 'NON_RESIDENT' },
        });
      }

      await writeAudit(tx, {
        action: 'RESIDENT_EXITED',
        entityType: 'Tenancy',
        entityId: tenancy.id,
        propertyId,
        summary: `${tenancy.user.fullName} moved out automatically — notice period ended`,
        actorRole: 'SYSTEM',
      });
    });

    exited += 1;
    await notify({
      event: 'MOVED_OUT',
      userId: tenancy.userId,
      dedupeKey: tenancy.id,
      params: {},
    });
  }

  return { exited, heldForDues };
}

/**
 * Rolls billing into the new month: anyone whose notice already matured is
 * moved out first (so they are not billed again), then everyone still
 * resident is invoiced for the new period — the same per-tenancy logic the
 * owner's manual "generate invoices" button uses, just run without a click.
 */
async function rolloverMonth(periodKey: PeriodKey, today: DateOnly): Promise<string> {
  const properties = await prisma.property.findMany({
    where: { status: 'ACTIVE' },
    include: { settings: true },
  });

  let exited = 0;
  let heldForDues = 0;
  let invoicesCreated = 0;
  let invoicesSkipped = 0;

  for (const property of properties) {
    if (property.settings === null) continue;

    const exitResult = await exitMaturedNotices(property.id, periodKey);
    exited += exitResult.exited;
    heldForDues += exitResult.heldForDues;

    const tenancies = await prisma.tenancy.findMany({
      where: {
        propertyId: property.id,
        OR: [{ status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }, { actualExitDate: { not: null } }],
      },
      include: {
        user: { select: { fullName: true } },
        allocations: {
          include: { bed: { select: { room: { select: { monthlyRentPaise: true, number: true } } } } },
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

    for (const tenancy of tenancies) {
      const wasCreated = await prisma.$transaction((tx) =>
        generateInvoiceForTenancy(tx, {
          propertyId: property.id,
          periodKey,
          settings: property.settings!,
          today,
          tenancy,
        }),
      );
      if (wasCreated) {
        invoicesCreated += 1;
        const billed = await prisma.invoice.findMany({
          where: { tenancyId: tenancy.id, periodKey, category: { not: 'DEPOSIT' } },
          select: { totalPaise: true, dueDate: true },
        });
        const firstBill = billed[0];
        if (firstBill !== undefined) {
          await notify({
            event: 'INVOICE_GENERATED',
            userId: tenancy.userId,
            dedupeKey: `${tenancy.id}:${periodKey}`,
            params: {
              month: monthLabel(periodKey),
              amountPaise: billed.reduce((sum, invoice) => sum + invoice.totalPaise, 0),
              dueDate: firstBill.dueDate.toISOString().slice(0, 10),
            },
          });
        }
      } else invoicesSkipped += 1;
    }
  }

  return (
    `Rolled over to ${periodKey}: ${exited} moved out, ${heldForDues} held (dues owed), ` +
    `${invoicesCreated} invoice(s) created, ${invoicesSkipped} skipped`
  );
}

/**
 * Starts the schedule.
 *
 * Times are in the property's timezone. Both jobs are keyed by DAY, so the
 * process restarting mid-morning cannot make them run twice.
 */
export function startScheduledJobs(): void {
  const timeZone = 'Asia/Kolkata';

  // 00:30 — after midnight, so "today" has definitely rolled over.
  cron.schedule(
    '30 0 * * *',
    () => {
      const today = todayInZone(timeZone);
      void runOnce('late-fees', today, () => recomputeLateFees(today));
    },
    { timezone: timeZone },
  );

  // 09:00 — a reasonable hour to be reminded about rent.
  cron.schedule(
    '0 9 * * *',
    () => {
      const today = todayInZone(timeZone);
      void runOnce('rent-reminders', today, () => createRentReminders(today));
    },
    { timezone: timeZone },
  );

  // Every 15 minutes: settle push tickets into delivered/failed and retire dead device tokens.
  cron.schedule('*/15 * * * *', () => {
    void reconcilePushReceipts().catch((error: unknown) =>
      logger.error({ err: error }, 'push receipt reconciliation failed'),
    );
  });

  // 00:35 on the 1st — after the late-fee run, once the new month has
  // definitely started. Keyed by the new period, not a day, since it must
  // run once per month rather than once per day.
  cron.schedule(
    '35 0 1 * *',
    () => {
      const today = todayInZone(timeZone);
      const periodKey = currentPeriodKey(timeZone);
      void runOnce('monthly-rollover', periodKey, () => rolloverMonth(periodKey, today));
    },
    { timezone: timeZone },
  );

  logger.info(
    { timeZone },
    'Scheduled jobs registered: late-fees 00:30, rent-reminders 09:00, monthly-rollover 00:35 on the 1st',
  );
}

/** Exposed so the jobs can be exercised without waiting for the clock. */
export const jobsForTesting = {
  recomputeLateFees,
  createRentReminders,
  rolloverMonth,
  exitMaturedNotices,
  runOnce,
};
