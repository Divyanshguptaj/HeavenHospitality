import type { BedView, FloorView, RoomView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  Select,
  StatTile,
  bedTone,
  formatDate,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import {
  useCreateFloor,
  useCreateRoom,
  useDeleteFloor,
  useDeleteRoom,
  useFloors,
  useOccupancy,
  useUpdateBedStatus,
  useUpdateRoom,
} from '../lib/ownerApi';

/**
 * Occupancy: the building, floor by floor.
 *
 * This is the internal view — it names who is in which bed. The guest-facing
 * equivalent is deliberately a coarse count.
 */
export function OccupancyPage() {
  const occupancy = useOccupancy();
  const floors = useFloors();

  const [floorDialogOpen, setFloorDialogOpen] = useState(false);
  const [roomDialog, setRoomDialog] = useState<{ mode: 'create' | 'edit'; room?: RoomView } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'floor' | 'room';
    id: string;
    label: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const deleteFloor = useDeleteFloor();
  const deleteRoom = useDeleteRoom();

  if (occupancy.isPending || floors.isPending) {
    return (
      <>
        <PageHeader title="Occupancy" />
        <LoadingRows rows={8} />
      </>
    );
  }

  if (occupancy.error) {
    return (
      <>
        <PageHeader title="Occupancy" />
        <Card>
          <ErrorState message={occupancy.error.message} onRetry={() => void occupancy.refetch()} />
        </Card>
      </>
    );
  }

  const { totals, floors: floorViews, upcomingVacancies } = occupancy.data;

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) return;
    setActionError(null);
    try {
      if (deleteTarget.kind === 'floor') {
        await deleteFloor.mutateAsync(deleteTarget.id);
      } else {
        await deleteRoom.mutateAsync(deleteTarget.id);
      }
      setDeleteTarget(null);
    } catch (error) {
      // The server refuses to delete a floor with rooms, or a room with
      // residents — surface its reason rather than a generic failure.
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not delete. Please try again.',
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Occupancy"
        description="Floors, rooms and beds. Assign residents from the Residents page."
        actions={
          <>
            <Button onClick={() => setFloorDialogOpen(true)}>Add floor</Button>
            <Button
              variant="primary"
              onClick={() => setRoomDialog({ mode: 'create' })}
              disabled={(floors.data?.length ?? 0) === 0}
            >
              Add room
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Rooms" value={String(totals.rooms)} />
        <StatTile label="Beds" value={String(totals.beds)} />
        <StatTile label="Occupied" value={String(totals.occupied)} tone="info" />
        <StatTile label="Available" value={String(totals.available)} tone="success" />
        <StatTile
          label="Out of service"
          value={String(totals.unavailable)}
          tone={totals.unavailable > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {actionError !== null && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {actionError}
        </div>
      )}

      {floorViews.length === 0 ? (
        <Card>
          <EmptyState
            title="No floors yet"
            description="Create a floor first, then add rooms to it."
            action={
              <Button variant="primary" onClick={() => setFloorDialogOpen(true)}>
                Add floor
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {floorViews.map((floor) => {
            const meta = floors.data?.find((candidate) => candidate.id === floor.id);
            return (
              <FloorSection
                key={floor.id}
                floor={floor}
                canDelete={meta?.canDelete ?? false}
                onAddRoom={() => setRoomDialog({ mode: 'create' })}
                onEditRoom={(room) => setRoomDialog({ mode: 'edit', room })}
                onDeleteRoom={(room) =>
                  setDeleteTarget({ kind: 'room', id: room.id, label: `Room ${room.number}` })
                }
                onDeleteFloor={() =>
                  setDeleteTarget({ kind: 'floor', id: floor.id, label: floor.name })
                }
              />
            );
          })}
        </div>
      )}

      {upcomingVacancies.length > 0 && (
        <div className="mt-4">
          <Card title="Upcoming vacancies">
            <ul className="flex flex-col">
              {upcomingVacancies.map((vacancy) => (
                <li
                  key={vacancy.tenancyId}
                  className="flex items-baseline justify-between border-b border-[var(--color-border)] py-2 text-sm last:border-b-0"
                >
                  <span>
                    <Link
                      to={`/residents/${vacancy.tenancyId}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {vacancy.residentName}
                    </Link>
                    <span className="text-[var(--color-text-muted)]">
                      {' '}
                      · Room {vacancy.roomNumber} bed {vacancy.bedLabel}
                    </span>
                  </span>
                  <span className="text-[var(--color-text-secondary)]">
                    {formatDate(vacancy.expectedExitDate)} ({vacancy.daysRemaining}d)
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <FloorDialog open={floorDialogOpen} onClose={() => setFloorDialogOpen(false)} />
      {roomDialog !== null && (
        <RoomDialog
          mode={roomDialog.mode}
          room={roomDialog.room}
          floors={floors.data ?? []}
          onClose={() => setRoomDialog(null)}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.label ?? ''}?`}
        message="This cannot be undone. Floors with rooms, and rooms with residents, cannot be deleted."
        confirmLabel="Delete"
        busy={deleteFloor.isPending || deleteRoom.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          setActionError(null);
        }}
      />
    </>
  );
}

function FloorSection({
  floor,
  canDelete,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
  onDeleteFloor,
}: {
  readonly floor: { id: string; name: string; level: number; rooms: readonly RoomView[] };
  readonly canDelete: boolean;
  readonly onAddRoom: () => void;
  readonly onEditRoom: (room: RoomView) => void;
  readonly onDeleteRoom: (room: RoomView) => void;
  readonly onDeleteFloor: () => void;
}) {
  const beds = floor.rooms.flatMap((room) => room.beds);
  const occupied = beds.filter((bed) => bed.status === 'OCCUPIED').length;

  return (
    <Card
      title={`${floor.name} — ${floor.rooms.length} rooms, ${occupied}/${beds.length} beds occupied`}
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onAddRoom}>
            Add room
          </Button>
          <Button
            variant="ghost"
            onClick={onDeleteFloor}
            disabled={!canDelete}
            title={canDelete ? 'Delete this floor' : 'Move or delete its rooms first'}
          >
            Delete floor
          </Button>
        </div>
      }
    >
      {floor.rooms.length === 0 ? (
        <EmptyState title="No rooms on this floor" description="Add a room to get started." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {floor.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onEdit={() => onEditRoom(room)}
              onDelete={() => onDeleteRoom(room)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function RoomCard({
  room,
  onEdit,
  onDelete,
}: {
  readonly room: RoomView;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            to={`/rooms/${room.id}`}
            className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            Room {room.number}
          </Link>
          <p className="text-xs text-[var(--color-text-muted)]">
            {room.roomType} · {room.isAirConditioned ? 'AC' : 'Non-AC'} ·{' '}
            {formatINR(room.monthlyRentPaise, { withPaise: false })}/mo
          </p>
        </div>
        {room.status !== 'ACTIVE' && <Badge label={room.status} tone="warning" />}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {room.beds.map((bed) => (
          <BedRow key={bed.id} bed={bed} />
        ))}
      </div>

      <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-2">
        <Link to={`/rooms/${room.id}`}>
          <Button variant="ghost">Manage residents</Button>
        </Link>
        <Button variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" onClick={onDelete} disabled={room.occupiedBeds > 0}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function BedRow({ bed }: { readonly bed: BedView }) {
  const updateStatus = useUpdateBedStatus();

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        <span className="font-medium text-[var(--color-text-primary)]">Bed {bed.label}</span>
        <Badge label={bed.status} tone={bedTone(bed.status)} />
      </span>

      {bed.occupant === null ? (
        <Select
          aria-label={`Status for bed ${bed.label}`}
          value={bed.status}
          className="w-36"
          disabled={updateStatus.isPending}
          onChange={(event) => {
            void updateStatus.mutateAsync({ id: bed.id, status: event.target.value });
          }}
        >
          <option value="AVAILABLE">Available</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="BLOCKED">Blocked</option>
        </Select>
      ) : (
        <Link
          to={`/residents/${bed.occupant.tenancyId}`}
          className="truncate text-[var(--color-primary)] hover:underline"
        >
          {bed.occupant.residentName}
        </Link>
      )}
    </div>
  );
}

function FloorDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const createFloor = useCreateFloor();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('0');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await createFloor.mutateAsync({ name: name.trim(), level: Number(level) });
      setName('');
      setLevel('0');
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not create the floor.');
    }
  }

  return (
    <Dialog
      open={open}
      title="Add floor"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={name.trim() === '' || createFloor.isPending}
          >
            {createFloor.isPending ? 'Saving…' : 'Add floor'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="floor-name" hint="For example, Ground Floor or First Floor.">
          <Input
            id="floor-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <Field
          label="Level"
          htmlFor="floor-level"
          hint="0 for ground. Used to order floors and must be unique."
        >
          <Input
            id="floor-level"
            type="number"
            min={0}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          />
        </Field>
        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function RoomDialog({
  mode,
  room,
  floors,
  onClose,
}: {
  readonly mode: 'create' | 'edit';
  readonly room?: RoomView | undefined;
  readonly floors: readonly FloorView[];
  readonly onClose: () => void;
}) {
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();

  const [form, setForm] = useState({
    floorId: room?.floor.id ?? floors[0]?.id ?? '',
    number: room?.number ?? '',
    roomType: room?.roomType ?? '3 Sharing',
    capacity: String(room?.capacity ?? 3),
    rent: String((room?.monthlyRentPaise ?? 700_000) / 100),
    isAirConditioned: room?.isAirConditioned ?? false,
    status: room?.status ?? 'ACTIVE',
  });
  const [error, setError] = useState<string | null>(null);

  const busy = createRoom.isPending || updateRoom.isPending;

  async function submit(): Promise<void> {
    setError(null);
    const payload = {
      floorId: form.floorId,
      number: form.number.trim(),
      roomType: form.roomType.trim(),
      capacity: Number(form.capacity),
      // Rupees in the form, paise on the wire — money crosses the boundary once.
      monthlyRentPaise: Math.round(Number(form.rent) * 100),
      isAirConditioned: form.isAirConditioned,
      status: form.status,
    };

    try {
      if (mode === 'create') {
        await createRoom.mutateAsync({ ...payload, facilities: [] });
      } else if (room !== undefined) {
        await updateRoom.mutateAsync({ id: room.id, ...payload });
      }
      onClose();
    } catch (caught) {
      // Reducing capacity below the number of occupied beds is refused by the
      // server with an explanation; show it verbatim.
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save the room.');
    }
  }

  return (
    <Dialog
      open
      title={mode === 'create' ? 'Add room' : `Edit room ${room?.number ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || form.number.trim() === '' || form.floorId === ''}
          >
            {busy ? 'Saving…' : 'Save room'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Floor" htmlFor="room-floor">
          <Select
            id="room-floor"
            value={form.floorId}
            onChange={(event) => setForm({ ...form, floorId: event.target.value })}
          >
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Room number" htmlFor="room-number">
          <Input
            id="room-number"
            value={form.number}
            onChange={(event) => setForm({ ...form, number: event.target.value })}
          />
        </Field>

        <Field label="Room type" htmlFor="room-type" hint="Shown to guests, e.g. 3 Sharing.">
          <Input
            id="room-type"
            value={form.roomType}
            onChange={(event) => setForm({ ...form, roomType: event.target.value })}
          />
        </Field>

        <Field
          label="Capacity"
          htmlFor="room-capacity"
          hint="Beds are created automatically to match."
        >
          <Input
            id="room-capacity"
            type="number"
            min={1}
            max={12}
            value={form.capacity}
            onChange={(event) => setForm({ ...form, capacity: event.target.value })}
          />
        </Field>

        <Field label="Rent per resident (₹/month)" htmlFor="room-rent">
          <Input
            id="room-rent"
            type="number"
            min={0}
            step={100}
            value={form.rent}
            onChange={(event) => setForm({ ...form, rent: event.target.value })}
          />
        </Field>

        <Field label="Status" htmlFor="room-status">
          <Select
            id="room-status"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as RoomView['status'] })
            }
          >
            <option value="ACTIVE">Active</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isAirConditioned}
            onChange={(event) => setForm({ ...form, isAirConditioned: event.target.checked })}
          />
          Air conditioned
        </label>

        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)] sm:col-span-2">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
