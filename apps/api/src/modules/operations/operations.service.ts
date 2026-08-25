import type {
  AttendanceStatusName,
  ExpenseView,
  InventoryItemView,
  NoticeView,
  ReminderEventView,
  StaffView,
} from '@heaven/contracts';

import { AppError } from '../../errors/AppError.js';
import {
  currentPeriodKey,
  firstDayOfPeriod,
  fromPrismaDate,
  lastDayOfPeriod,
  todayInZone,
  toPrismaDate,
  type DateOnly,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getPropertyContext } from '../property/property.context.js';
import { toNoticeView } from '../resident/resident.service.js';

/**
 * Supporting operations: notices, staff, inventory, expenses and the reminder
 * log. Deliberately simple (spec §19) — no payroll, no stock valuation, no
 * approval chains. Enough to keep the owner from needing a second app.
 */

// --- Notices ----------------------------------------------------------------

export async function listNotices(actor: Actor): Promise<NoticeView[]> {
  const { propertyId } = await getPropertyContext(actor, 'notice:manage');

  const notices = await prisma.notice.findMany({
    where: { propertyId },
    orderBy: [{ isPinned: 'desc' }, { startsOn: 'desc' }],
  });

  return notices.map(toNoticeView);
}

export async function createNotice(
  actor: Actor,
  input: {
    title: string;
    body: string;
    startsOn: DateOnly;
    endsOn?: DateOnly | undefined;
    isPinned: boolean;
  },
): Promise<NoticeView> {
  const { propertyId } = await getPropertyContext(actor, 'notice:manage');

  if (input.endsOn !== undefined && input.endsOn < input.startsOn) {
    throw new AppError('VALIDATION_FAILED', 'The end date must be on or after the start date.');
  }

  const notice = await prisma.notice.create({
    data: {
      propertyId,
      title: input.title,
      body: input.body,
      startsOn: toPrismaDate(input.startsOn),
      endsOn: input.endsOn === undefined ? null : toPrismaDate(input.endsOn),
      isPinned: input.isPinned,
    },
  });

  return toNoticeView(notice);
}

export async function deleteNotice(actor: Actor, noticeId: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'notice:manage');
  const deleted = await prisma.notice.deleteMany({ where: { id: noticeId, propertyId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Notice not found.');
}

// --- Staff ------------------------------------------------------------------

export async function listStaff(actor: Actor): Promise<StaffView[]> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'staff:manage');
  const today = todayInZone(timezone);
  const periodKey = currentPeriodKey(timezone);

  const staff = await prisma.staff.findMany({
    where: { propertyId },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    include: {
      attendance: {
        where: {
          date: {
            gte: toPrismaDate(firstDayOfPeriod(periodKey)),
            lte: toPrismaDate(lastDayOfPeriod(periodKey)),
          },
        },
      },
    },
  });

  return staff.map((member) => {
    const todaysRecord = member.attendance.find((record) => fromPrismaDate(record.date) === today);

    return {
      id: member.id,
      fullName: member.fullName,
      role: member.role,
      phone: member.phone,
      monthlySalaryPaise: member.monthlySalaryPaise,
      isActive: member.isActive,
      joinedOn: fromPrismaDate(member.joinedOn),
      todayStatus: todaysRecord?.status ?? null,
      // Half days count as half, so the figure is usable for payroll later.
      presentDaysThisMonth: member.attendance.reduce(
        (sum, record) =>
          sum + (record.status === 'PRESENT' ? 1 : record.status === 'HALF_DAY' ? 0.5 : 0),
        0,
      ),
    };
  });
}

export async function createStaff(
  actor: Actor,
  input: {
    fullName: string;
    role: string;
    phone?: string | undefined;
    monthlySalaryPaise?: number | undefined;
    joinedOn: DateOnly;
  },
): Promise<StaffView[]> {
  const { propertyId } = await getPropertyContext(actor, 'staff:manage');

  await prisma.staff.create({
    data: {
      propertyId,
      fullName: input.fullName,
      role: input.role,
      phone: input.phone ?? null,
      monthlySalaryPaise: input.monthlySalaryPaise ?? null,
      joinedOn: toPrismaDate(input.joinedOn),
    },
  });

  return listStaff(actor);
}

/**
 * Marks attendance. Upserted on `(staffId, date)`, so marking twice corrects the
 * record rather than creating a duplicate day.
 */
export async function markStaffAttendance(
  actor: Actor,
  staffId: string,
  input: { date: DateOnly; status: AttendanceStatusName },
): Promise<StaffView[]> {
  const { propertyId } = await getPropertyContext(actor, 'staff:manage');

  const member = await prisma.staff.findFirst({
    where: { id: staffId, propertyId },
    select: { id: true },
  });
  if (member === null) throw new AppError('NOT_FOUND', 'Staff member not found.');

  const date = toPrismaDate(input.date);
  await prisma.staffAttendance.upsert({
    where: { staffId_date: { staffId, date } },
    update: { status: input.status },
    create: { staffId, date, status: input.status },
  });

  return listStaff(actor);
}

export async function setStaffActive(
  actor: Actor,
  staffId: string,
  isActive: boolean,
): Promise<StaffView[]> {
  const { propertyId } = await getPropertyContext(actor, 'staff:manage');
  const updated = await prisma.staff.updateMany({
    where: { id: staffId, propertyId },
    data: { isActive },
  });
  if (updated.count === 0) throw new AppError('NOT_FOUND', 'Staff member not found.');
  return listStaff(actor);
}

// --- Inventory --------------------------------------------------------------

export async function listInventory(actor: Actor): Promise<InventoryItemView[]> {
  const { propertyId } = await getPropertyContext(actor, 'inventory:manage');

  const items = await prisma.inventoryItem.findMany({
    where: { propertyId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unitCostPaise: item.unitCostPaise,
    purchasedOn: item.purchasedOn === null ? null : fromPrismaDate(item.purchasedOn),
    notes: item.notes,
  }));
}

export async function createInventoryItem(
  actor: Actor,
  input: {
    name: string;
    category: string;
    quantity: number;
    unitCostPaise?: number | undefined;
    purchasedOn?: DateOnly | undefined;
    notes?: string | undefined;
  },
): Promise<InventoryItemView[]> {
  const { propertyId } = await getPropertyContext(actor, 'inventory:manage');

  await prisma.inventoryItem.create({
    data: {
      propertyId,
      name: input.name,
      category: input.category,
      quantity: input.quantity,
      unitCostPaise: input.unitCostPaise ?? null,
      purchasedOn: input.purchasedOn === undefined ? null : toPrismaDate(input.purchasedOn),
      notes: input.notes ?? null,
    },
  });

  return listInventory(actor);
}

export async function deleteInventoryItem(actor: Actor, itemId: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'inventory:manage');
  const deleted = await prisma.inventoryItem.deleteMany({ where: { id: itemId, propertyId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Item not found.');
}

// --- Expenses ---------------------------------------------------------------

export async function listExpenses(
  actor: Actor,
  periodKey?: string,
): Promise<{ expenses: ExpenseView[]; totalPaise: number }> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'inventory:manage');
  const period = periodKey ?? currentPeriodKey(timezone);

  const expenses = await prisma.expense.findMany({
    where: {
      propertyId,
      spentOn: {
        gte: toPrismaDate(firstDayOfPeriod(period)),
        lte: toPrismaDate(lastDayOfPeriod(period)),
      },
    },
    orderBy: { spentOn: 'desc' },
  });

  return {
    expenses: expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      category: expense.category,
      amountPaise: expense.amountPaise,
      spentOn: fromPrismaDate(expense.spentOn),
      notes: expense.notes,
    })),
    totalPaise: expenses.reduce((sum, expense) => sum + expense.amountPaise, 0),
  };
}

export async function createExpense(
  actor: Actor,
  input: {
    title: string;
    category: string;
    amountPaise: number;
    spentOn: DateOnly;
    notes?: string | undefined;
  },
): Promise<{ expenses: ExpenseView[]; totalPaise: number }> {
  const { propertyId } = await getPropertyContext(actor, 'inventory:manage');

  await prisma.expense.create({
    data: {
      propertyId,
      title: input.title,
      category: input.category,
      amountPaise: input.amountPaise,
      spentOn: toPrismaDate(input.spentOn),
      notes: input.notes ?? null,
    },
  });

  return listExpenses(actor);
}

export async function deleteExpense(actor: Actor, expenseId: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'inventory:manage');
  const deleted = await prisma.expense.deleteMany({ where: { id: expenseId, propertyId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Expense not found.');
}

// --- Reminders --------------------------------------------------------------

export async function listReminders(actor: Actor): Promise<ReminderEventView[]> {
  const { propertyId } = await getPropertyContext(actor, 'notification:read');

  const reminders = await prisma.reminderEvent.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return reminders.map((reminder) => ({
    id: reminder.id,
    kind: reminder.kind,
    channel: reminder.channel,
    status: reminder.status,
    message: reminder.message,
    createdAt: reminder.createdAt.toISOString(),
    sentAt: reminder.sentAt?.toISOString() ?? null,
  }));
}
