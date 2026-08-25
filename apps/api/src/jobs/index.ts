import { Prisma } from '@prisma/client';
import cron from 'node-cron';

import { todayInZone, type DateOnly } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { recomputeInvoice } from '../modules/billing/invoice.service.js';

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

/**
 * Creates rent reminders for invoices that are due soon, due today, or overdue.
 *
 * The reminder is only RECORDED here. Delivery is a separate concern and is
 * mocked for now (spec §20) — `dedupeKey` is unique, so re-running the job can
 * never produce a duplicate message.
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
      },
      include: { tenancy: { include: { user: { select: { fullName: true } } } } },
    });

    for (const invoice of invoices) {
      const dueDate = invoice.dueDate.toISOString().slice(0, 10);
      const outstanding = invoice.totalPaise - invoice.amountPaidPaise;
      if (outstanding <= 0) continue;

      const kind = today < dueDate ? 'BEFORE_DUE' : today === dueDate ? 'ON_DUE' : 'AFTER_DUE';

      // Only nudge shortly before the due date, not for the whole month.
      if (kind === 'BEFORE_DUE') {
        const daysUntil =
          (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
        if (daysUntil > 3) continue;
      }

      const dedupeKey = `rent:${invoice.tenancyId}:${invoice.periodKey}:${kind}`;

      try {
        await prisma.reminderEvent.create({
          data: {
            propertyId: property.id,
            invoiceId: invoice.id,
            tenancyId: invoice.tenancyId,
            kind,
            channel: 'IN_APP',
            status: 'PENDING',
            dedupeKey,
            message:
              `${invoice.tenancy.user.fullName}: ₹${(outstanding / 100).toFixed(2)} for ` +
              `${invoice.periodKey} ${kind === 'AFTER_DUE' ? 'is overdue' : `is due on ${dueDate}`}.`,
          },
        });
        created += 1;
      } catch (error) {
        // The unique dedupeKey is doing its job — this reminder already exists.
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== PRISMA_UNIQUE_VIOLATION
        ) {
          throw error;
        }
      }
    }
  }

  return `Created ${created} rent reminder(s)`;
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

  logger.info({ timeZone }, 'Scheduled jobs registered: late-fees 00:30, rent-reminders 09:00');
}

/** Exposed so the jobs can be exercised without waiting for the clock. */
export const jobsForTesting = { recomputeLateFees, createRentReminders, runOnce };
