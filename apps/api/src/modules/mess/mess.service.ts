import type { MealCountView, MealTypeName, MenuDayView } from '@heaven/contracts';
import { MEAL_TYPES } from '@heaven/contracts';

import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../lib/audit.js';
import {
  isoWeekday,
  localTimeInZone,
  todayInZone,
  toPrismaDate,
  type DateOnly,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getActiveTenancyForActor, getPropertyContext } from '../property/property.context.js';

/**
 * Mess: the weekly menu, meal timings and absence.
 *
 * Absence is OPT-OUT — everyone is counted unless they say otherwise. That is
 * both far less data and far less friction than asking every resident to confirm
 * attendance three times a day, and it degrades safely: a resident who forgets
 * to say anything is still cooked for.
 */

export async function getMenu(propertyId: string): Promise<MenuDayView[]> {
  const items = await prisma.weeklyMenuItem.findMany({
    where: { propertyId },
    orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
  });

  const byDay = new Map<number, Array<{ mealType: MealTypeName; items: string[] }>>();
  for (const item of items) {
    const meals = byDay.get(item.dayOfWeek) ?? [];
    meals.push({ mealType: item.mealType, items: item.items });
    byDay.set(item.dayOfWeek, meals);
  }

  // Every day appears, even with no menu set, so the owner sees the gaps.
  return Array.from({ length: 7 }, (_unused, index) => index + 1).map((dayOfWeek) => ({
    dayOfWeek,
    meals: byDay.get(dayOfWeek) ?? [],
  }));
}

export async function getMenuForOwner(actor: Actor): Promise<MenuDayView[]> {
  const { propertyId } = await getPropertyContext(actor, 'mess:read');
  return getMenu(propertyId);
}

export async function updateMenu(
  actor: Actor,
  input: { dayOfWeek: number; mealType: MealTypeName; items: string[] },
): Promise<MenuDayView[]> {
  const { propertyId } = await getPropertyContext(actor, 'mess:write');

  if (input.items.length === 0) {
    // An empty list means "nothing served", which is a deletion rather than a
    // row full of nothing.
    await prisma.weeklyMenuItem.deleteMany({
      where: { propertyId, dayOfWeek: input.dayOfWeek, mealType: input.mealType },
    });
  } else {
    await prisma.weeklyMenuItem.upsert({
      where: {
        propertyId_dayOfWeek_mealType: {
          propertyId,
          dayOfWeek: input.dayOfWeek,
          mealType: input.mealType,
        },
      },
      update: { items: input.items },
      create: {
        propertyId,
        dayOfWeek: input.dayOfWeek,
        mealType: input.mealType,
        items: input.items,
      },
    });
  }

  return getMenu(propertyId);
}

export async function updateMealTiming(
  actor: Actor,
  input: { mealType: MealTypeName; startsAt: string; endsAt: string },
): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'mess:write');

  if (input.endsAt <= input.startsAt) {
    throw new AppError('VALIDATION_FAILED', 'The end time must be after the start time.');
  }

  await prisma.mealTiming.upsert({
    where: { propertyId_mealType: { propertyId, mealType: input.mealType } },
    update: { startsAt: input.startsAt, endsAt: input.endsAt },
    create: {
      propertyId,
      mealType: input.mealType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  });
}

/**
 * Expected meal counts for a date — what the kitchen actually needs.
 *
 * Counts everyone whose stay covers the date, minus declared absences. A
 * resident who has left is not cooked for; one who joins tomorrow is not counted
 * today.
 */
export async function getMealCounts(propertyId: string, date: DateOnly): Promise<MealCountView> {
  const target = toPrismaDate(date);

  const activeCount = await prisma.tenancy.count({
    where: {
      propertyId,
      joiningDate: { lte: target },
      OR: [{ actualExitDate: null }, { actualExitDate: { gte: target } }],
      status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
    },
  });

  const absences = await prisma.mealAbsence.groupBy({
    by: ['mealType'],
    where: { date: target, tenancy: { propertyId } },
    _count: { _all: true },
  });

  const absentByMeal = new Map(absences.map((row) => [row.mealType, row._count._all]));

  return {
    date,
    counts: MEAL_TYPES.map((mealType) => {
      const absent = absentByMeal.get(mealType) ?? 0;
      return { mealType, expected: Math.max(0, activeCount - absent), absent };
    }),
    totalActiveResidents: activeCount,
  };
}

export async function getMealCountsForOwner(actor: Actor, date?: DateOnly): Promise<MealCountView> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'mess:read');
  return getMealCounts(propertyId, date ?? todayInZone(timezone));
}

/**
 * Records a resident's absences for one day.
 *
 * The whole day is replaced rather than toggled per meal, so a resubmission is
 * naturally idempotent — and the unique constraint on
 * `(tenancyId, date, mealType)` stops a double-tap creating duplicates even if
 * two requests race.
 *
 * Editing is allowed until the owner-configured cutoff, after which the kitchen
 * has already shopped and cooked.
 */
export async function markAbsence(
  actor: Actor,
  input: { date: DateOnly; absentMeals: MealTypeName[] },
): Promise<{ date: DateOnly; absentMeals: MealTypeName[] }> {
  const { tenancyId, timezone, settings } = await getActiveTenancyForActor(actor);
  const today = todayInZone(timezone);

  if (input.date < today) {
    throw new AppError('MESS_CUTOFF_PASSED', 'You cannot change a past date.');
  }

  // The cutoff applies to *today only*: tomorrow's meals are still open however
  // late it is now.
  if (input.date === today && localTimeInZone(timezone) >= settings.mealCutoffLocalTime) {
    throw new AppError(
      'MESS_CUTOFF_PASSED',
      `Changes for today closed at ${settings.mealCutoffLocalTime}. You can still update tomorrow.`,
    );
  }

  const date = toPrismaDate(input.date);

  await prisma.$transaction(async (tx) => {
    await tx.mealAbsence.deleteMany({ where: { tenancyId, date } });
    if (input.absentMeals.length > 0) {
      await tx.mealAbsence.createMany({
        data: input.absentMeals.map((mealType) => ({ tenancyId, date, mealType })),
      });
    }
  });

  return { date: input.date, absentMeals: input.absentMeals };
}

export async function getAbsencesForResident(
  actor: Actor,
  fromDate: DateOnly,
  toDate: DateOnly,
): Promise<Array<{ date: DateOnly; mealType: MealTypeName }>> {
  const { tenancyId } = await getActiveTenancyForActor(actor);

  const absences = await prisma.mealAbsence.findMany({
    where: { tenancyId, date: { gte: toPrismaDate(fromDate), lte: toPrismaDate(toDate) } },
    orderBy: { date: 'asc' },
  });

  return absences.map((absence) => ({
    date: absence.date.toISOString().slice(0, 10),
    mealType: absence.mealType,
  }));
}

/** The owner can correct a count when a resident forgot to declare (spec §16). */
export async function overrideAbsence(
  actor: Actor,
  input: { tenancyId: string; date: DateOnly; absentMeals: MealTypeName[] },
): Promise<MealCountView> {
  const { propertyId } = await getPropertyContext(actor, 'mess:write');

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: input.tenancyId, propertyId },
    include: { user: { select: { fullName: true } } },
  });
  if (tenancy === null) throw new AppError('NOT_FOUND', 'Resident not found.');

  const date = toPrismaDate(input.date);

  await prisma.$transaction(async (tx) => {
    await tx.mealAbsence.deleteMany({ where: { tenancyId: input.tenancyId, date } });
    if (input.absentMeals.length > 0) {
      await tx.mealAbsence.createMany({
        data: input.absentMeals.map((mealType) => ({
          tenancyId: input.tenancyId,
          date,
          mealType,
          overriddenByOwner: true,
        })),
      });
    }

    await writeAudit(tx, {
      action: 'ATTENDANCE_OVERRIDDEN',
      entityType: 'MealAbsence',
      entityId: input.tenancyId,
      propertyId,
      summary: `Meal attendance corrected for ${tenancy.user.fullName} on ${input.date}`,
      actorUserId: actor.userId,
      actorRole: 'ADMIN',
      after: { absentMeals: input.absentMeals },
    });
  });

  return getMealCounts(propertyId, input.date);
}

/** Today's menu with timings, for the resident home screen. */
export async function getTodaysMenu(
  propertyId: string,
  date: DateOnly,
): Promise<
  Array<{
    mealType: MealTypeName;
    items: string[];
    startsAt: string | null;
    endsAt: string | null;
  }>
> {
  const dayOfWeek = isoWeekday(date);

  const [items, timings] = await Promise.all([
    prisma.weeklyMenuItem.findMany({ where: { propertyId, dayOfWeek } }),
    prisma.mealTiming.findMany({ where: { propertyId } }),
  ]);

  const itemsByMeal = new Map(items.map((item) => [item.mealType, item.items]));
  const timingByMeal = new Map(timings.map((timing) => [timing.mealType, timing]));

  return MEAL_TYPES.map((mealType) => ({
    mealType,
    items: itemsByMeal.get(mealType) ?? [],
    startsAt: timingByMeal.get(mealType)?.startsAt ?? null,
    endsAt: timingByMeal.get(mealType)?.endsAt ?? null,
  }));
}
