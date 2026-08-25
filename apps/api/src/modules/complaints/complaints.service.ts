import type {
  ComplaintCategoryName,
  ComplaintDetailView,
  ComplaintStatusName,
  ComplaintSummaryView,
} from '@heaven/contracts';

import type { Prisma } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getActiveTenancyForActor, getPropertyContext } from '../property/property.context.js';

/**
 * Complaints.
 *
 * A resident sees only their own; the owner sees all of them. Ownership is
 * checked in the query itself, so there is no path where one resident can read
 * another's complaint by guessing an id (spec §26).
 */

const COMPLAINT_INCLUDE = {
  raisedBy: {
    select: {
      fullName: true,
      tenancies: {
        where: { status: { in: ['ACTIVE', 'NOTICE_PERIOD'] as const } },
        take: 1,
        include: {
          allocations: {
            where: { endedAt: null },
            include: { bed: { select: { room: { select: { number: true } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.ComplaintInclude;

type ComplaintRecord = Awaited<
  ReturnType<typeof prisma.complaint.findFirstOrThrow<{ include: typeof COMPLAINT_INCLUDE }>>
>;

function roomNumberOf(complaint: ComplaintRecord): string | null {
  return complaint.raisedBy.tenancies[0]?.allocations[0]?.bed.room.number ?? null;
}

function toSummary(complaint: ComplaintRecord): ComplaintSummaryView {
  return {
    id: complaint.id,
    title: complaint.title,
    category: complaint.category,
    status: complaint.status,
    createdAt: complaint.createdAt.toISOString(),
    residentName: complaint.raisedBy.fullName,
    roomNumber: roomNumberOf(complaint),
  };
}

export async function listComplaintsForOwner(
  actor: Actor,
  filters: Loose<{ status: string; category: string }> = {},
): Promise<ComplaintSummaryView[]> {
  const { propertyId } = await getPropertyContext(actor, 'complaint:read');

  const complaints = await prisma.complaint.findMany({
    where: {
      propertyId,
      ...(filters.status === undefined || filters.status === 'ALL'
        ? {}
        : { status: filters.status as ComplaintStatusName }),
      ...(filters.category === undefined || filters.category === 'ALL'
        ? {}
        : { category: filters.category as ComplaintCategoryName }),
    },
    // Open work first, then most recent — the owner's queue, not a log.
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: COMPLAINT_INCLUDE,
  });

  return complaints.map(toSummary);
}

export async function listComplaintsForResident(actor: Actor): Promise<ComplaintSummaryView[]> {
  const complaints = await prisma.complaint.findMany({
    // Scoped to the authenticated user, never to an id from the request.
    where: { raisedByUserId: actor.userId },
    orderBy: { createdAt: 'desc' },
    include: COMPLAINT_INCLUDE,
  });

  return complaints.map(toSummary);
}

async function readDetail(complaintId: string, where: object): Promise<ComplaintDetailView> {
  const complaint = await prisma.complaint.findFirst({
    where: { id: complaintId, ...where },
    include: {
      ...COMPLAINT_INCLUDE,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (complaint === null) throw new AppError('NOT_FOUND', 'Complaint not found.');

  const actorIds = complaint.events
    .map((event) => event.actorUserId)
    .filter((id): id is string => id !== null);

  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        });
  const namesById = new Map(actors.map((user) => [user.id, user.fullName]));

  return {
    ...toSummary(complaint),
    description: complaint.description,
    imageUrl: complaint.imageUrl,
    reopenCount: complaint.reopenCount,
    events: complaint.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
      actorName: event.actorUserId === null ? null : (namesById.get(event.actorUserId) ?? null),
    })),
  };
}

export async function getComplaintForOwner(
  actor: Actor,
  complaintId: string,
): Promise<ComplaintDetailView> {
  const { propertyId } = await getPropertyContext(actor, 'complaint:read');
  return readDetail(complaintId, { propertyId });
}

export async function getComplaintForResident(
  actor: Actor,
  complaintId: string,
): Promise<ComplaintDetailView> {
  // Another resident's complaint id resolves to nothing at all — reported as
  // NOT_FOUND rather than FORBIDDEN so ids cannot be probed.
  return readDetail(complaintId, { raisedByUserId: actor.userId });
}

export async function createComplaint(
  actor: Actor,
  input: {
    title: string;
    description: string;
    category: ComplaintCategoryName;
    imageUrl?: string | undefined;
  },
): Promise<ComplaintDetailView> {
  const { tenancyId, propertyId } = await getActiveTenancyForActor(actor);

  const complaintId = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.create({
      data: {
        propertyId,
        raisedByUserId: actor.userId,
        tenancyId,
        title: input.title,
        description: input.description,
        category: input.category,
        imageUrl: input.imageUrl ?? null,
        status: 'OPEN',
        events: {
          create: { toStatus: 'OPEN', note: 'Complaint raised', actorUserId: actor.userId },
        },
      },
      include: { raisedBy: { select: { fullName: true } } },
    });

    await writeAudit(tx, {
      action: 'COMPLAINT_RAISED',
      entityType: 'Complaint',
      entityId: complaint.id,
      propertyId,
      summary: `${complaint.raisedBy.fullName} raised "${input.title}" (${input.category})`,
      actorUserId: actor.userId,
      actorRole: 'RESIDENT',
    });

    return complaint.id;
  });

  return readDetail(complaintId, { raisedByUserId: actor.userId });
}

/**
 * Updates a complaint's status and/or adds a note.
 *
 * Every change appends to the timeline rather than overwriting, so the resident
 * can see what happened and when. Moving back from RESOLVED/CLOSED counts as a
 * reopen and is recorded as one.
 */
export async function updateComplaint(
  actor: Actor,
  complaintId: string,
  input: { status?: ComplaintStatusName | undefined; note?: string | undefined },
): Promise<ComplaintDetailView> {
  const { propertyId } = await getPropertyContext(actor, 'complaint:write');

  const complaint = await prisma.complaint.findFirst({
    where: { id: complaintId, propertyId },
    include: { raisedBy: { select: { fullName: true } } },
  });
  if (complaint === null) throw new AppError('NOT_FOUND', 'Complaint not found.');

  if (input.status === undefined && (input.note === undefined || input.note === '')) {
    throw new AppError('VALIDATION_FAILED', 'Provide a status change or a note.');
  }

  await prisma.$transaction(async (tx) => {
    const isReopen =
      input.status !== undefined &&
      (complaint.status === 'RESOLVED' || complaint.status === 'CLOSED') &&
      (input.status === 'OPEN' || input.status === 'IN_PROGRESS');

    if (input.status !== undefined && input.status !== complaint.status) {
      await tx.complaint.update({
        where: { id: complaintId },
        data: {
          status: input.status,
          resolvedAt: input.status === 'RESOLVED' ? new Date() : null,
          ...(isReopen ? { reopenCount: complaint.reopenCount + 1 } : {}),
        },
      });
    }

    await tx.complaintEvent.create({
      data: {
        complaintId,
        fromStatus: complaint.status,
        toStatus: input.status ?? null,
        note: input.note ?? null,
        actorUserId: actor.userId,
      },
    });

    await writeAudit(tx, {
      action: 'COMPLAINT_UPDATED',
      entityType: 'Complaint',
      entityId: complaintId,
      propertyId,
      summary:
        input.status === undefined
          ? `Note added to "${complaint.title}"`
          : `"${complaint.title}" moved to ${input.status}`,
      actorUserId: actor.userId,
      actorRole: 'OWNER',
      before: { status: complaint.status },
      after: { status: input.status ?? complaint.status },
    });
  });

  return readDetail(complaintId, { propertyId });
}
