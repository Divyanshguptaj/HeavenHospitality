import type { BedView, FloorView, RoomView } from '@heaven/contracts';
import { Prisma, type Bed, type Floor, type Room } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { writeAudit } from '../../lib/audit.js';
import { fromPrismaDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getPropertyContext } from './property.context.js';

/**
 * Floors, rooms and beds.
 *
 * Beds are derived from room capacity rather than created by hand: a room with
 * capacity 3 has beds A, B and C, always. That keeps "capacity" and "how many
 * people can actually live here" from drifting apart.
 */

/** Bed labels are A, B, C… so they read naturally on a door or a form. */
function bedLabelFor(index: number): string {
  return String.fromCharCode(65 + index);
}

const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION
  );
}

// --- Floors -----------------------------------------------------------------

export async function listFloors(actor: Actor): Promise<FloorView[]> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');

  const floors = await prisma.floor.findMany({
    where: { propertyId },
    orderBy: { level: 'asc' },
    include: { rooms: { include: { beds: { select: { status: true } } } } },
  });

  return floors.map((floor) => {
    const beds = floor.rooms.flatMap((room) => room.beds);
    return {
      id: floor.id,
      name: floor.name,
      level: floor.level,
      roomCount: floor.rooms.length,
      bedCount: beds.length,
      occupiedBeds: beds.filter((bed) => bed.status === 'OCCUPIED').length,
      // A floor holding rooms cannot be deleted; the UI explains why rather than
      // failing on submit.
      canDelete: floor.rooms.length === 0,
    };
  });
}

export async function createFloor(
  actor: Actor,
  input: { name: string; level: number },
): Promise<FloorView> {
  const { propertyId } = await getPropertyContext(actor, 'floor:manage');

  try {
    const floor = await prisma.$transaction(async (tx) => {
      const created = await tx.floor.create({
        data: { propertyId, name: input.name, level: input.level },
      });
      await writeAudit(tx, {
        action: 'FLOOR_CREATED',
        entityType: 'Floor',
        entityId: created.id,
        propertyId,
        summary: `Floor "${created.name}" created`,
        actorUserId: actor.userId,
        actorRole: 'OWNER',
      });
      return created;
    });

    return {
      id: floor.id,
      name: floor.name,
      level: floor.level,
      roomCount: 0,
      bedCount: 0,
      occupiedBeds: 0,
      canDelete: true,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('ALREADY_EXISTS', 'A floor with that name or level already exists.');
    }
    throw error;
  }
}

export async function updateFloor(
  actor: Actor,
  floorId: string,
  input: Loose<{ name: string; level: number }>,
): Promise<FloorView> {
  const { propertyId } = await getPropertyContext(actor, 'floor:manage');

  // Scoped by propertyId, not just id — an id from another property must not be
  // reachable. updateMany returns a count rather than throwing on no-match.
  // Undefined keys are dropped: Prisma wants an absent property, not one
  // explicitly set to undefined.
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

  const updated = await prisma.floor.updateMany({ where: { id: floorId, propertyId }, data });

  if (updated.count === 0) throw new AppError('NOT_FOUND', 'Floor not found.');

  const floors = await listFloors(actor);
  const floor = floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) throw new AppError('NOT_FOUND', 'Floor not found.');
  return floor;
}

export async function deleteFloor(actor: Actor, floorId: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'floor:manage');

  const floor = await prisma.floor.findFirst({
    where: { id: floorId, propertyId },
    include: { _count: { select: { rooms: true } } },
  });

  if (floor === null) throw new AppError('NOT_FOUND', 'Floor not found.');

  // Deleting a floor with rooms would orphan beds and, through them, occupancy
  // history. The owner must move or delete the rooms first.
  if (floor._count.rooms > 0) {
    throw new AppError(
      'CONFLICT',
      `This floor still has ${floor._count.rooms} room(s). Move or delete them first.`,
    );
  }

  await prisma.floor.delete({ where: { id: floorId } });
}

// --- Rooms ------------------------------------------------------------------

type RoomWithRelations = Room & {
  floor: Floor;
  beds: Array<
    Bed & {
      allocations: Array<{
        tenancy: { id: string; expectedExitDate: Date | null; user: { fullName: string } };
      }>;
    }
  >;
};

const ROOM_INCLUDE = {
  floor: true,
  beds: {
    orderBy: { label: 'asc' },
    include: {
      // Only the OPEN allocation identifies the current occupant.
      allocations: {
        where: { endedAt: null },
        include: {
          tenancy: {
            select: { id: true, expectedExitDate: true, user: { select: { fullName: true } } },
          },
        },
      },
    },
  },
} as const;

export function toRoomView(room: RoomWithRelations): RoomView {
  const beds: BedView[] = room.beds.map((bed) => {
    const open = bed.allocations[0];
    return {
      id: bed.id,
      label: bed.label,
      status: bed.status,
      occupant:
        open === undefined
          ? null
          : {
              tenancyId: open.tenancy.id,
              residentName: open.tenancy.user.fullName,
              expectedExitDate:
                open.tenancy.expectedExitDate === null
                  ? null
                  : fromPrismaDate(open.tenancy.expectedExitDate),
            },
    };
  });

  return {
    id: room.id,
    number: room.number,
    roomType: room.roomType,
    capacity: room.capacity,
    monthlyRentPaise: room.monthlyRentPaise,
    isAirConditioned: room.isAirConditioned,
    description: room.description,
    facilities: room.facilities,
    status: room.status,
    floor: { id: room.floor.id, name: room.floor.name, level: room.floor.level },
    beds,
    occupiedBeds: beds.filter((bed) => bed.status === 'OCCUPIED').length,
    availableBeds: beds.filter((bed) => bed.status === 'AVAILABLE').length,
  };
}

export async function listRooms(
  actor: Actor,
  filters: Loose<{ floorId: string }> = {},
): Promise<RoomView[]> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');

  const rooms = await prisma.room.findMany({
    where: { propertyId, ...(filters.floorId === undefined ? {} : { floorId: filters.floorId }) },
    orderBy: [{ floor: { level: 'asc' } }, { number: 'asc' }],
    include: ROOM_INCLUDE,
  });

  return rooms.map(toRoomView);
}

export async function getRoom(actor: Actor, roomId: string): Promise<RoomView> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');

  const room = await prisma.room.findFirst({
    where: { id: roomId, propertyId },
    include: ROOM_INCLUDE,
  });

  if (room === null) throw new AppError('NOT_FOUND', 'Room not found.');
  return toRoomView(room);
}

export interface CreateRoomInput {
  floorId: string;
  number: string;
  roomType: string;
  capacity: number;
  monthlyRentPaise: number;
  isAirConditioned: boolean;
  description?: string | null | undefined;
  facilities: string[];
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
}

export async function createRoom(actor: Actor, input: CreateRoomInput): Promise<RoomView> {
  const { propertyId } = await getPropertyContext(actor, 'room:manage');

  const floor = await prisma.floor.findFirst({
    where: { id: input.floorId, propertyId },
    select: { id: true },
  });
  if (floor === null) throw new AppError('NOT_FOUND', 'Floor not found.');

  try {
    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          propertyId,
          floorId: input.floorId,
          number: input.number,
          roomType: input.roomType,
          capacity: input.capacity,
          monthlyRentPaise: input.monthlyRentPaise,
          isAirConditioned: input.isAirConditioned,
          description: input.description ?? null,
          facilities: input.facilities,
          status: input.status,
          // Beds are created with the room so capacity is never a promise the
          // room cannot keep.
          beds: {
            create: Array.from({ length: input.capacity }, (_unused, index) => ({
              label: bedLabelFor(index),
            })),
          },
        },
        include: ROOM_INCLUDE,
      });

      await writeAudit(tx, {
        action: 'ROOM_CREATED',
        entityType: 'Room',
        entityId: created.id,
        propertyId,
        summary: `Room ${created.number} created with ${input.capacity} bed(s)`,
        actorUserId: actor.userId,
        actorRole: 'OWNER',
      });

      return created;
    });

    return toRoomView(room);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('ALREADY_EXISTS', `Room ${input.number} already exists.`);
    }
    throw error;
  }
}

/**
 * Updates a room, synchronising its beds when capacity changes.
 *
 * Growing capacity adds beds. Shrinking it removes only beds that are free —
 * an occupied bed cannot simply disappear (spec §26), so the operation is
 * refused with an explanation rather than silently evicting someone.
 */
export async function updateRoom(
  actor: Actor,
  roomId: string,
  input: Loose<CreateRoomInput>,
): Promise<RoomView> {
  const { propertyId } = await getPropertyContext(actor, 'room:manage');

  const existing = await prisma.room.findFirst({
    where: { id: roomId, propertyId },
    include: { beds: { orderBy: { label: 'asc' } } },
  });
  if (existing === null) throw new AppError('NOT_FOUND', 'Room not found.');

  if (input.floorId !== undefined) {
    const floor = await prisma.floor.findFirst({
      where: { id: input.floorId, propertyId },
      select: { id: true },
    });
    if (floor === null) throw new AppError('NOT_FOUND', 'Floor not found.');
  }

  const newCapacity = input.capacity ?? existing.capacity;
  const currentCount = existing.beds.length;

  if (newCapacity < currentCount) {
    const removable = existing.beds.slice(newCapacity).filter((bed) => bed.status !== 'OCCUPIED');
    const blocked = existing.beds.slice(newCapacity).length - removable.length;

    if (blocked > 0) {
      throw new AppError(
        'CONFLICT',
        `Cannot reduce capacity to ${newCapacity}: ${blocked} of the beds being removed are occupied. Move those residents first.`,
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.room.update({
        where: { id: roomId },
        data: {
          ...(input.floorId === undefined ? {} : { floorId: input.floorId }),
          ...(input.number === undefined ? {} : { number: input.number }),
          ...(input.roomType === undefined ? {} : { roomType: input.roomType }),
          ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
          ...(input.monthlyRentPaise === undefined
            ? {}
            : { monthlyRentPaise: input.monthlyRentPaise }),
          ...(input.isAirConditioned === undefined
            ? {}
            : { isAirConditioned: input.isAirConditioned }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.facilities === undefined ? {} : { facilities: input.facilities }),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
      });

      if (newCapacity > currentCount) {
        await tx.bed.createMany({
          data: Array.from({ length: newCapacity - currentCount }, (_unused, index) => ({
            roomId,
            label: bedLabelFor(currentCount + index),
          })),
        });
      } else if (newCapacity < currentCount) {
        await tx.bed.deleteMany({
          where: { id: { in: existing.beds.slice(newCapacity).map((bed) => bed.id) } },
        });
      }

      await writeAudit(tx, {
        action: 'ROOM_UPDATED',
        entityType: 'Room',
        entityId: roomId,
        propertyId,
        summary: `Room ${input.number ?? existing.number} updated`,
        actorUserId: actor.userId,
        actorRole: 'OWNER',
        before: { capacity: existing.capacity, monthlyRentPaise: existing.monthlyRentPaise },
        after: {
          capacity: newCapacity,
          monthlyRentPaise: input.monthlyRentPaise ?? existing.monthlyRentPaise,
        },
      });

      return tx.room.findUniqueOrThrow({ where: { id: roomId }, include: ROOM_INCLUDE });
    });

    return toRoomView(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('ALREADY_EXISTS', 'A room with that number already exists.');
    }
    throw error;
  }
}

export async function deleteRoom(actor: Actor, roomId: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'room:manage');

  const room = await prisma.room.findFirst({
    where: { id: roomId, propertyId },
    include: { beds: { where: { status: 'OCCUPIED' }, select: { id: true } } },
  });
  if (room === null) throw new AppError('NOT_FOUND', 'Room not found.');

  if (room.beds.length > 0) {
    throw new AppError('CONFLICT', 'This room still has residents. Move them out first.');
  }

  await prisma.room.delete({ where: { id: roomId } });
}

// --- Beds -------------------------------------------------------------------

/**
 * Sets a bed's availability.
 *
 * OCCUPIED is not settable by hand — occupancy is a consequence of assigning a
 * resident, and letting the owner type it in would let the bed's status disagree
 * with its allocation.
 */
export async function updateBedStatus(
  actor: Actor,
  bedId: string,
  status: 'AVAILABLE' | 'MAINTENANCE' | 'BLOCKED',
): Promise<RoomView> {
  const { propertyId } = await getPropertyContext(actor, 'bed:manage');

  const bed = await prisma.bed.findFirst({
    where: { id: bedId, room: { propertyId } },
    include: { allocations: { where: { endedAt: null }, select: { id: true } } },
  });
  if (bed === null) throw new AppError('NOT_FOUND', 'Bed not found.');

  if (bed.allocations.length > 0) {
    throw new AppError(
      'CONFLICT',
      'This bed is occupied. Move the resident out before changing its status.',
    );
  }

  await prisma.bed.update({ where: { id: bedId }, data: { status } });
  return getRoom(actor, bed.roomId);
}
