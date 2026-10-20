import { roomTypeName, type RoomTypeView } from '@heaven/contracts';
import { Prisma, type PrismaClient, type RoomType } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../lib/audit.js';
import { formatINR } from '@heaven/money';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getPropertyContext } from './property.context.js';

/**
 * Room types: the saved kinds of room an admin picks from when adding a room.
 *
 * A room keeps its own copy of capacity, AC and rent (set from its type when it is
 * created or changed), so billing and everything that reads a room is unchanged.
 */

type Db = Pick<PrismaClient, 'roomType'> | Prisma.TransactionClient;

const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION
  );
}

const ALREADY_EXISTS_MESSAGE = 'A room type with that sharing, AC setting and rent already exists.';

function toView(type: RoomType & { _count: { rooms: number } }): RoomTypeView {
  return {
    id: type.id,
    name: roomTypeName(type.capacity, type.isAirConditioned),
    capacity: type.capacity,
    isAirConditioned: type.isAirConditioned,
    monthlyRentPaise: type.monthlyRentPaise,
    isActive: type.isActive,
    roomCount: type._count.rooms,
  };
}

export interface RoomTypeFields {
  readonly roomTypeId: string;
  readonly roomType: string;
  readonly capacity: number;
  readonly isAirConditioned: boolean;
  readonly monthlyRentPaise: number;
}

/** The room fields a saved type supplies; a switched-off type is refused unless `allowInactive`. */
export async function resolveRoomType(
  db: Db,
  propertyId: string,
  roomTypeId: string,
  allowInactive = false,
): Promise<RoomTypeFields> {
  const type = await db.roomType.findFirst({ where: { id: roomTypeId, propertyId } });
  if (type === null) throw new AppError('NOT_FOUND', 'Room type not found.');
  if (!type.isActive && !allowInactive) {
    throw new AppError('CONFLICT', 'That room type is switched off. Choose another one.');
  }
  return {
    roomTypeId: type.id,
    roomType: `${type.capacity} Sharing`,
    capacity: type.capacity,
    isAirConditioned: type.isAirConditioned,
    monthlyRentPaise: type.monthlyRentPaise,
  };
}

export async function listRoomTypes(
  actor: Actor,
  filters: { includeInactive?: boolean } = {},
): Promise<RoomTypeView[]> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');

  const types = await prisma.roomType.findMany({
    where: { propertyId, ...(filters.includeInactive === true ? {} : { isActive: true }) },
    orderBy: [{ capacity: 'asc' }, { isAirConditioned: 'desc' }, { monthlyRentPaise: 'desc' }],
    include: { _count: { select: { rooms: true } } },
  });
  return types.map(toView);
}

export async function createRoomType(
  actor: Actor,
  input: { capacity: number; isAirConditioned: boolean; monthlyRentPaise: number },
): Promise<RoomTypeView> {
  const { propertyId } = await getPropertyContext(actor, 'room:manage');

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.roomType.create({
        data: { propertyId, ...input },
        include: { _count: { select: { rooms: true } } },
      });
      await writeAudit(tx, {
        action: 'ROOM_TYPE_CREATED',
        entityType: 'RoomType',
        entityId: created.id,
        propertyId,
        summary: `Room type ${roomTypeName(created.capacity, created.isAirConditioned)} added at ${formatINR(created.monthlyRentPaise, { withPaise: false })}`,
        actorUserId: actor.userId,
        actorRole: 'ADMIN',
      });
      return toView(created);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('ALREADY_EXISTS', ALREADY_EXISTS_MESSAGE);
    throw error;
  }
}

export interface UpdateRoomTypeInput {
  capacity?: number | undefined;
  isAirConditioned?: boolean | undefined;
  monthlyRentPaise?: number | undefined;
  isActive?: boolean | undefined;
}

/**
 * Changes a room type. A new rent is copied onto every room of that type, so bills
 * made from then on use it; bills already issued are not touched. Sharing and AC
 * are fixed once a room uses the type.
 */
export async function updateRoomType(
  actor: Actor,
  roomTypeId: string,
  input: UpdateRoomTypeInput,
): Promise<RoomTypeView> {
  const { propertyId } = await getPropertyContext(actor, 'room:manage');

  const existing = await prisma.roomType.findFirst({
    where: { id: roomTypeId, propertyId },
    include: { _count: { select: { rooms: true } } },
  });
  if (existing === null) throw new AppError('NOT_FOUND', 'Room type not found.');

  const changesShape =
    (input.capacity !== undefined && input.capacity !== existing.capacity) ||
    (input.isAirConditioned !== undefined && input.isAirConditioned !== existing.isAirConditioned);
  if (changesShape && existing._count.rooms > 0) {
    throw new AppError(
      'CONFLICT',
      `${existing._count.rooms} room(s) use this type, so its sharing and AC setting cannot change. Add a new room type and move the rooms to it.`,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.roomType.update({
        where: { id: roomTypeId },
        data: {
          ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
          ...(input.isAirConditioned === undefined ? {} : { isAirConditioned: input.isAirConditioned }),
          ...(input.monthlyRentPaise === undefined ? {} : { monthlyRentPaise: input.monthlyRentPaise }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        include: { _count: { select: { rooms: true } } },
      });

      if (input.monthlyRentPaise !== undefined && input.monthlyRentPaise !== existing.monthlyRentPaise) {
        await tx.room.updateMany({
          where: { roomTypeId },
          data: { monthlyRentPaise: input.monthlyRentPaise },
        });
      }

      await writeAudit(tx, {
        action: 'ROOM_TYPE_UPDATED',
        entityType: 'RoomType',
        entityId: roomTypeId,
        propertyId,
        summary: `Room type ${roomTypeName(updated.capacity, updated.isAirConditioned)} updated`,
        actorUserId: actor.userId,
        actorRole: 'ADMIN',
        before: {
          monthlyRentPaise: existing.monthlyRentPaise,
          isActive: existing.isActive,
          capacity: existing.capacity,
          isAirConditioned: existing.isAirConditioned,
        },
        after: {
          monthlyRentPaise: updated.monthlyRentPaise,
          isActive: updated.isActive,
          capacity: updated.capacity,
          isAirConditioned: updated.isAirConditioned,
        },
      });

      return toView(updated);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('ALREADY_EXISTS', ALREADY_EXISTS_MESSAGE);
    throw error;
  }
}

export async function deleteRoomType(actor: Actor, roomTypeId: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'room:manage');

  const existing = await prisma.roomType.findFirst({
    where: { id: roomTypeId, propertyId },
    include: { _count: { select: { rooms: true } } },
  });
  if (existing === null) throw new AppError('NOT_FOUND', 'Room type not found.');
  if (existing._count.rooms > 0) {
    throw new AppError(
      'CONFLICT',
      `${existing._count.rooms} room(s) use this type. Switch it off instead of deleting it.`,
    );
  }

  await prisma.roomType.delete({ where: { id: roomTypeId } });
}
