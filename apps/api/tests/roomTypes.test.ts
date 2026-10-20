import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const roomType = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const room = {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  const bed = { createMany: vi.fn(), deleteMany: vi.fn() };
  const floor = { findFirst: vi.fn() };
  const auditLog = { create: vi.fn() };
  const client: Record<string, unknown> = { roomType, room, bed, floor, auditLog };
  client['$transaction'] = (callback: (tx: unknown) => unknown) => callback(client);
  return { client, roomType, room, bed, floor, auditLog };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: db.client }));
vi.mock('../src/modules/property/property.context.js', () => ({
  getPropertyContext: () => Promise.resolve({ propertyId: 'p1' }),
}));

const { createRoomType, updateRoomType, deleteRoomType, listRoomTypes, resolveRoomType } = await import(
  '../src/modules/property/roomTypes.service.js'
);
const { createRoom, updateRoom } = await import('../src/modules/property/rooms.service.js');
type Actor = Parameters<typeof createRoomType>[0];

const actor = { userId: 'admin-1' } as Actor;

const type = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  propertyId: 'p1',
  capacity: 3,
  isAirConditioned: true,
  monthlyRentPaise: 1_150_000,
  isActive: true,
  _count: { rooms: 0 },
  ...overrides,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });

beforeEach(() => {
  for (const group of [db.roomType, db.room, db.bed, db.floor, db.auditLog]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
});

describe('room types', () => {
  it('lists the room types with their titles and how many rooms use each', async () => {
    db.roomType.findMany.mockResolvedValue([type({ _count: { rooms: 3 } })]);

    const [first] = await listRoomTypes(actor);

    expect(first).toMatchObject({ name: '3 Sharing · AC', monthlyRentPaise: 1_150_000, roomCount: 3 });
  });

  it('hides switched-off types unless asked for them', async () => {
    db.roomType.findMany.mockResolvedValue([]);

    await listRoomTypes(actor);
    await listRoomTypes(actor, { includeInactive: true });

    expect(db.roomType.findMany.mock.calls[0]?.[0].where).toEqual({ propertyId: 'p1', isActive: true });
    expect(db.roomType.findMany.mock.calls[1]?.[0].where).toEqual({ propertyId: 'p1' });
  });

  it('adds a room type and records who did it', async () => {
    db.roomType.create.mockResolvedValue(type());

    const created = await createRoomType(actor, {
      capacity: 3,
      isAirConditioned: true,
      monthlyRentPaise: 1_150_000,
    });

    expect(created.name).toBe('3 Sharing · AC');
    expect(db.auditLog.create.mock.calls[0]?.[0].data.action).toBe('ROOM_TYPE_CREATED');
  });

  it('refuses a duplicate room type', async () => {
    db.roomType.create.mockRejectedValue(uniqueViolation());

    await expect(
      createRoomType(actor, { capacity: 3, isAirConditioned: true, monthlyRentPaise: 1_150_000 }),
    ).rejects.toThrow(/already exists/);
  });

  it('copies a new rent onto every room of the type', async () => {
    db.roomType.findFirst.mockResolvedValue(type({ _count: { rooms: 3 } }));
    db.roomType.update.mockResolvedValue(type({ monthlyRentPaise: 1_200_000, _count: { rooms: 3 } }));

    await updateRoomType(actor, 't1', { monthlyRentPaise: 1_200_000 });

    expect(db.room.updateMany).toHaveBeenCalledWith({
      where: { roomTypeId: 't1' },
      data: { monthlyRentPaise: 1_200_000 },
    });
  });

  it('leaves rooms alone when only switching a type off', async () => {
    db.roomType.findFirst.mockResolvedValue(type());
    db.roomType.update.mockResolvedValue(type({ isActive: false }));

    await updateRoomType(actor, 't1', { isActive: false });

    expect(db.room.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to change sharing or AC once rooms use the type', async () => {
    db.roomType.findFirst.mockResolvedValue(type({ _count: { rooms: 2 } }));

    await expect(updateRoomType(actor, 't1', { capacity: 4 })).rejects.toThrow(/2 room\(s\) use this type/);
    await expect(updateRoomType(actor, 't1', { isAirConditioned: false })).rejects.toThrow(/cannot change/);
    expect(db.roomType.update).not.toHaveBeenCalled();
  });

  it('allows changing sharing on a type no room uses yet', async () => {
    db.roomType.findFirst.mockResolvedValue(type());
    db.roomType.update.mockResolvedValue(type({ capacity: 4 }));

    await expect(updateRoomType(actor, 't1', { capacity: 4 })).resolves.toMatchObject({ capacity: 4 });
  });

  it('refuses to delete a type that rooms use', async () => {
    db.roomType.findFirst.mockResolvedValue(type({ _count: { rooms: 1 } }));

    await expect(deleteRoomType(actor, 't1')).rejects.toThrow(/Switch it off/);
    expect(db.roomType.delete).not.toHaveBeenCalled();
  });

  it('deletes a type nobody uses', async () => {
    db.roomType.findFirst.mockResolvedValue(type());

    await deleteRoomType(actor, 't1');

    expect(db.roomType.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('refuses a switched-off type for a new room but allows it for a room already on it', async () => {
    db.roomType.findFirst.mockResolvedValue(type({ isActive: false }));

    await expect(resolveRoomType(db.client as never, 'p1', 't1')).rejects.toThrow(/switched off/);
    await expect(resolveRoomType(db.client as never, 'p1', 't1', true)).resolves.toMatchObject({
      roomType: '3 Sharing',
    });
  });

  it('refuses a type from another property', async () => {
    db.roomType.findFirst.mockResolvedValue(null);

    await expect(resolveRoomType(db.client as never, 'p1', 'other')).rejects.toThrow(/not found/);
  });
});

describe('adding and changing rooms by type', () => {
  const roomRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'r1',
    number: '105',
    roomTypeId: 't1',
    roomType: '3 Sharing',
    capacity: 3,
    monthlyRentPaise: 1_150_000,
    isAirConditioned: true,
    description: null,
    facilities: [],
    status: 'ACTIVE',
    floor: { id: 'f1', name: 'First', level: 1 },
    beds: [],
    ...overrides,
  });

  it('fills capacity, AC and rent from the chosen type and makes the beds', async () => {
    db.floor.findFirst.mockResolvedValue({ id: 'f1' });
    db.roomType.findFirst.mockResolvedValue(type());
    db.room.create.mockResolvedValue(roomRow());

    await createRoom(actor, { floorId: 'f1', number: '105', roomTypeId: 't1', facilities: [], status: 'ACTIVE' });

    const data = db.room.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      roomTypeId: 't1',
      roomType: '3 Sharing',
      capacity: 3,
      monthlyRentPaise: 1_150_000,
      isAirConditioned: true,
    });
    expect(data.beds.create.map((bed: { label: string }) => bed.label)).toEqual(['A', 'B', 'C']);
  });

  it('still accepts a room set up by hand, without a type', async () => {
    db.floor.findFirst.mockResolvedValue({ id: 'f1' });
    db.room.create.mockResolvedValue(roomRow({ roomTypeId: null }));

    await createRoom(actor, {
      floorId: 'f1',
      number: '105',
      roomType: '2 Sharing',
      capacity: 2,
      monthlyRentPaise: 1_000_000,
      isAirConditioned: false,
      facilities: [],
      status: 'ACTIVE',
    });

    expect(db.room.create.mock.calls[0]?.[0].data).toMatchObject({ roomTypeId: null, capacity: 2 });
  });

  it('moves an existing room to another type and adds the beds it now needs', async () => {
    db.room.findFirst.mockResolvedValue({
      id: 'r1',
      number: '105',
      capacity: 3,
      monthlyRentPaise: 1_150_000,
      roomTypeId: 't1',
      beds: ['A', 'B', 'C'].map((label) => ({ id: `bed-${label}`, label, status: 'AVAILABLE' })),
    });
    db.roomType.findFirst.mockResolvedValue(type({ id: 't2', capacity: 4, monthlyRentPaise: 1_050_000 }));
    db.room.findUniqueOrThrow.mockResolvedValue(roomRow());

    await updateRoom(actor, 'r1', { roomTypeId: 't2' });

    expect(db.room.update.mock.calls[0]?.[0].data).toMatchObject({
      roomTypeId: 't2',
      capacity: 4,
      monthlyRentPaise: 1_050_000,
    });
    expect(db.bed.createMany.mock.calls[0]?.[0].data).toEqual([{ roomId: 'r1', label: 'D' }]);
  });

  it('refuses a move to a smaller type while the beds that would go are occupied', async () => {
    db.room.findFirst.mockResolvedValue({
      id: 'r1',
      number: '105',
      capacity: 3,
      monthlyRentPaise: 1_150_000,
      roomTypeId: 't1',
      beds: ['A', 'B', 'C'].map((label) => ({
        id: `bed-${label}`,
        label,
        status: label === 'C' ? 'OCCUPIED' : 'AVAILABLE',
      })),
    });
    db.roomType.findFirst.mockResolvedValue(type({ id: 't2', capacity: 2 }));

    await expect(updateRoom(actor, 'r1', { roomTypeId: 't2' })).rejects.toThrow(/Move those residents first/);
    expect(db.room.update).not.toHaveBeenCalled();
  });

  it('detaches a room from its type when its rent is typed in by hand', async () => {
    db.room.findFirst.mockResolvedValue({
      id: 'r1',
      number: '105',
      capacity: 3,
      monthlyRentPaise: 1_150_000,
      roomTypeId: 't1',
      beds: ['A', 'B', 'C'].map((label) => ({ id: `bed-${label}`, label, status: 'AVAILABLE' })),
    });
    db.room.findUniqueOrThrow.mockResolvedValue(roomRow());

    await updateRoom(actor, 'r1', { monthlyRentPaise: 1_000_000 });

    expect(db.room.update.mock.calls[0]?.[0].data).toMatchObject({
      roomTypeId: null,
      monthlyRentPaise: 1_000_000,
    });
  });

  it('leaves the type alone when only the room number changes', async () => {
    db.room.findFirst.mockResolvedValue({
      id: 'r1',
      number: '105',
      capacity: 3,
      monthlyRentPaise: 1_150_000,
      roomTypeId: 't1',
      beds: ['A', 'B', 'C'].map((label) => ({ id: `bed-${label}`, label, status: 'AVAILABLE' })),
    });
    db.room.findUniqueOrThrow.mockResolvedValue(roomRow({ number: '106' }));

    await updateRoom(actor, 'r1', { number: '106' });

    expect(db.room.update.mock.calls[0]?.[0].data).not.toHaveProperty('roomTypeId');
  });
});
