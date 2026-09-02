import type { DashboardView, OccupancyView } from '@heaven/contracts';

import {
  currentPeriodKey,
  daysBetween,
  fromPrismaDate,
  todayInZone,
  toPrismaDate,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getMealCounts } from '../mess/mess.service.js';
import { getPropertyContext } from '../property/property.context.js';
import { toRoomView } from '../property/rooms.service.js';

/**
 * The owner's dashboard.
 *
 * Every number is computed from the database on request — nothing is a
 * decorative placeholder, and nothing is stored in a field that could drift out
 * of date. The set is what an owner actually needs to run the day (spec §3):
 * who owes money, how many meals to cook, what is broken, which beds free up.
 */

/** Vacancies further out than this are not yet actionable. */
const VACANCY_HORIZON_DAYS = 60;
const RECENT_ACTIVITY_LIMIT = 12;

export async function getDashboard(actor: Actor): Promise<DashboardView> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'property:read');
  const today = todayInZone(timezone);
  const periodKey = currentPeriodKey(timezone);

  const [beds, residents, invoices, complaints, upcoming, activity, meals] = await Promise.all([
    prisma.bed.groupBy({
      by: ['status'],
      where: { room: { propertyId } },
      _count: { _all: true },
    }),
    prisma.tenancy.count({
      where: { propertyId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
    }),
    prisma.invoice.findMany({
      where: { propertyId, periodKey, status: { not: 'CANCELLED' } },
      include: {
        tenancy: {
          include: {
            user: { select: { fullName: true } },
            allocations: {
              where: { endedAt: null },
              include: { bed: { select: { room: { select: { number: true } } } } },
            },
          },
        },
      },
    }),
    prisma.complaint.count({
      where: { propertyId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    }),
    prisma.tenancy.findMany({
      where: {
        propertyId,
        status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
        expectedExitDate: {
          not: null,
          gte: toPrismaDate(today),
          lte: toPrismaDate(addDaysSimple(today, VACANCY_HORIZON_DAYS)),
        },
      },
      orderBy: { expectedExitDate: 'asc' },
      include: {
        user: { select: { fullName: true } },
        allocations: {
          where: { endedAt: null },
          include: { bed: { select: { label: true, room: { select: { number: true } } } } },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      include: { actorUser: { select: { fullName: true } } },
    }),
    getMealCounts(propertyId, today),
  ]);

  const bedCountBy = new Map(beds.map((row) => [row.status, row._count._all]));
  const totalBeds = beds.reduce((sum, row) => sum + row._count._all, 0);

  const roomCount = await prisma.room.count({ where: { propertyId } });

  // Expected is the sum of what was actually invoiced this period, not a
  // theoretical rent roll — those differ whenever someone joins mid-month.
  const expectedPaise = invoices.reduce((sum, invoice) => sum + invoice.totalPaise, 0);
  const collectedPaise = invoices.reduce((sum, invoice) => sum + invoice.amountPaidPaise, 0);

  const unpaid = invoices
    .filter((invoice) => invoice.amountPaidPaise < invoice.totalPaise)
    .map((invoice) => ({
      tenancyId: invoice.tenancyId,
      residentName: invoice.tenancy.user.fullName,
      roomNumber: invoice.tenancy.allocations[0]?.bed.room.number ?? null,
      outstandingPaise: invoice.totalPaise - invoice.amountPaidPaise,
      status: invoice.status,
      dueDate: fromPrismaDate(invoice.dueDate),
    }))
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise);

  return {
    occupancy: {
      totalRooms: roomCount,
      totalBeds,
      occupiedBeds: bedCountBy.get('OCCUPIED') ?? 0,
      availableBeds: bedCountBy.get('AVAILABLE') ?? 0,
      totalResidents: residents,
    },
    money: {
      periodKey,
      expectedPaise,
      collectedPaise,
      pendingPaise: Math.max(0, expectedPaise - collectedPaise),
      overdueInvoiceCount: invoices.filter((invoice) => invoice.status === 'OVERDUE').length,
    },
    unpaidResidents: unpaid,
    meals,
    openComplaints: complaints,
    upcomingVacancies: upcoming
      .filter((tenancy) => tenancy.expectedExitDate !== null)
      .map((tenancy) => {
        const exitDate = fromPrismaDate(tenancy.expectedExitDate as Date);
        return {
          residentName: tenancy.user.fullName,
          roomNumber: tenancy.allocations[0]?.bed.room.number ?? '—',
          bedLabel: tenancy.allocations[0]?.bed.label ?? '—',
          expectedExitDate: exitDate,
          daysRemaining: daysBetween(today, exitDate),
        };
      }),
    recentActivity: activity.map((entry) => ({
      id: entry.id,
      action: entry.action,
      summary: entry.summary,
      actorName: entry.actorUser?.fullName ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

function addDaysSimple(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Floor-by-floor occupancy for the owner.
 *
 * This is the internal view: it names who is in which bed. The guest-facing
 * equivalent is deliberately a coarse count (docs/0004-authorization.md).
 */
export async function getOccupancy(actor: Actor): Promise<OccupancyView> {
  const { propertyId, timezone } = await getPropertyContext(actor, 'property:read');
  const today = todayInZone(timezone);

  const floors = await prisma.floor.findMany({
    where: { propertyId },
    orderBy: { level: 'asc' },
    include: {
      rooms: {
        orderBy: { number: 'asc' },
        include: {
          floor: true,
          beds: {
            orderBy: { label: 'asc' },
            include: {
              allocations: {
                where: { endedAt: null },
                include: {
                  tenancy: {
                    select: {
                      id: true,
                      expectedExitDate: true,
                      user: { select: { fullName: true } },
                      invoices: {
                        select: { totalPaise: true, amountPaidPaise: true, status: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const floorViews = floors.map((floor) => ({
    id: floor.id,
    name: floor.name,
    level: floor.level,
    rooms: floor.rooms.map(toRoomView),
  }));

  const allBeds = floorViews.flatMap((floor) => floor.rooms.flatMap((room) => room.beds));
  const occupied = allBeds.filter((bed) => bed.status === 'OCCUPIED').length;
  const available = allBeds.filter((bed) => bed.status === 'AVAILABLE').length;

  const upcoming = await prisma.tenancy.findMany({
    where: {
      propertyId,
      status: { in: ['ACTIVE', 'NOTICE_PERIOD'] },
      expectedExitDate: { not: null, gte: toPrismaDate(today) },
    },
    orderBy: { expectedExitDate: 'asc' },
    include: {
      user: { select: { fullName: true } },
      allocations: {
        where: { endedAt: null },
        include: { bed: { select: { label: true, room: { select: { number: true } } } } },
      },
    },
  });

  return {
    totals: {
      rooms: floorViews.reduce((sum, floor) => sum + floor.rooms.length, 0),
      beds: allBeds.length,
      occupied,
      available,
      unavailable: allBeds.length - occupied - available,
      occupancyRate: allBeds.length === 0 ? 0 : Math.round((occupied / allBeds.length) * 100),
    },
    floors: floorViews,
    upcomingVacancies: upcoming
      .filter((tenancy) => tenancy.expectedExitDate !== null)
      .map((tenancy) => {
        const exitDate = fromPrismaDate(tenancy.expectedExitDate as Date);
        return {
          tenancyId: tenancy.id,
          residentName: tenancy.user.fullName,
          roomNumber: tenancy.allocations[0]?.bed.room.number ?? '—',
          bedLabel: tenancy.allocations[0]?.bed.label ?? '—',
          expectedExitDate: exitDate,
          daysRemaining: daysBetween(today, exitDate),
        };
      }),
  };
}
