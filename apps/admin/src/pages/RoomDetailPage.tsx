import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  bedTone,
  formatDate,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import { lookupUserByPhone, useCreateResident, useExitResident, useRoom } from '../lib/ownerApi';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One room: who is in which bed, and the two moves an owner makes from here —
 * fill an empty bed with an existing account, or take someone off one.
 *
 * Both go through the same accounts the app already knows about. Filling a
 * bed searches by phone rather than creating a person on the spot, because a
 * resident's account is meant to come from their own signup (spec:
 * mobile number + password) — the owner is attaching a stay to it, not
 * inventing the account. Removing one is refused while rent is outstanding,
 * so a debt is never left stranded on an account that has lost its room.
 */
export function RoomDetailPage() {
  const { id = '' } = useParams();
  const room = useRoom(id);

  const [assignBedId, setAssignBedId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    tenancyId: string;
    bedLabel: string;
    residentName: string;
    outstandingPaise: number;
  } | null>(null);

  if (room.isPending) {
    return (
      <>
        <PageHeader title="Room" />
        <LoadingRows rows={6} />
      </>
    );
  }

  if (room.error) {
    return (
      <>
        <PageHeader title="Room" />
        <Card>
          <ErrorState message={room.error.message} onRetry={() => void room.refetch()} />
        </Card>
      </>
    );
  }

  const data = room.data;

  return (
    <>
      <PageHeader
        title={`Room ${data.number}`}
        description={`${data.floor.name} · ${data.roomType} · ${data.isAirConditioned ? 'AC' : 'Non-AC'} · ${formatINR(
          data.monthlyRentPaise,
          { withPaise: false },
        )}/month`}
        actions={
          <Link to="/occupancy">
            <Button>Back to occupancy</Button>
          </Link>
        }
      />

      <Card title={`${data.occupiedBeds} of ${data.beds.length} beds occupied`}>
        <div className="flex flex-col gap-3">
          {data.beds.map((bed) => (
            <div
              key={bed.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-[var(--color-text-primary)]">
                  Bed {bed.label}
                </span>
                <Badge label={bed.status} tone={bedTone(bed.status)} />
              </div>

              {bed.occupant !== null ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-right">
                    <Link
                      to={`/residents/${bed.occupant.tenancyId}`}
                      className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {bed.occupant.residentName}
                    </Link>
                    {bed.occupant.outstandingPaise > 0 && (
                      <p className="text-xs text-[var(--color-danger)]">
                        {formatINR(bed.occupant.outstandingPaise, { withPaise: false })} owed
                      </p>
                    )}
                  </div>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setRemoveTarget({
                        tenancyId: bed.occupant?.tenancyId ?? '',
                        bedLabel: bed.label,
                        residentName: bed.occupant?.residentName ?? '',
                        outstandingPaise: bed.occupant?.outstandingPaise ?? 0,
                      })
                    }
                  >
                    Remove from room
                  </Button>
                </div>
              ) : bed.status === 'AVAILABLE' ? (
                <Button variant="primary" onClick={() => setAssignBedId(bed.id)}>
                  Add resident
                </Button>
              ) : (
                <span className="text-sm text-[var(--color-text-muted)]">
                  Not offerable — change its status in Occupancy first.
                </span>
              )}
            </div>
          ))}

          {data.beds.length === 0 && (
            <EmptyState title="No beds" description="This room has no beds configured." />
          )}
        </div>
      </Card>

      {assignBedId !== null && (
        <AssignDialog
          roomNumber={data.number}
          bedId={assignBedId}
          bedLabel={data.beds.find((bed) => bed.id === assignBedId)?.label ?? ''}
          onClose={() => setAssignBedId(null)}
        />
      )}

      {removeTarget !== null && (
        <RemoveDialog target={removeTarget} onClose={() => setRemoveTarget(null)} />
      )}
    </>
  );
}

/**
 * Fills one bed with an account that already exists — found by phone, since
 * that is the identity every resident signs up with, not created here.
 */
function AssignDialog({
  roomNumber,
  bedId,
  bedLabel,
  onClose,
}: {
  readonly roomNumber: string;
  readonly bedId: string;
  readonly bedLabel: string;
  readonly onClose: () => void;
}) {
  const createResident = useCreateResident();

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    hasActiveTenancy: boolean;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const [joiningDate, setJoiningDate] = useState(todayString());
  const [error, setError] = useState<string | null>(null);

  async function search(): Promise<void> {
    const value = phone.trim();
    if (value === '') return;

    setChecking(true);
    setError(null);
    setFound(null);
    setNotFound(false);
    try {
      const result = await lookupUserByPhone(value);
      if (result === null) setNotFound(true);
      else setFound(result);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not search.');
    } finally {
      setChecking(false);
    }
  }

  async function assign(): Promise<void> {
    if (found === null) return;
    setError(null);
    try {
      await createResident.mutateAsync({
        existingUserId: found.id,
        fullName: found.fullName,
        phone: found.phone ?? phone.trim(),
        ...(found.email === null ? {} : { email: found.email }),
        joiningDate,
        bedId,
        securityDepositPaise: 0,
      });
      onClose();
    } catch (caught) {
      // A bed someone else just took surfaces as BED_ALREADY_ALLOCATED here.
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the resident.');
    }
  }

  return (
    <Dialog
      open
      title={`Add resident — room ${roomNumber}, bed ${bedLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void assign()}
            disabled={
              found === null || found.hasActiveTenancy || joiningDate === '' || createResident.isPending
            }
          >
            {createResident.isPending ? 'Adding…' : 'Add to this room'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Phone number"
          htmlFor="assign-phone"
          hint="They must already have an account — new accounts sign up in the app."
        >
          <div className="flex gap-2">
            <Input
              id="assign-phone"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setFound(null);
                setNotFound(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void search();
              }}
              placeholder="+91XXXXXXXXXX"
              autoFocus
            />
            <Button onClick={() => void search()} disabled={phone.trim() === '' || checking}>
              {checking ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </Field>

        {notFound && (
          <div className="rounded-md bg-[var(--color-warning-subtle)] px-3 py-2 text-sm text-[var(--color-warning)]">
            No account with that number. They need to sign up in the app first — search again once
            they have.
          </div>
        )}

        {found !== null && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              found.hasActiveTenancy
                ? 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]'
                : 'bg-[var(--color-info-subtle)] text-[var(--color-info)]'
            }`}
          >
            {found.hasActiveTenancy
              ? `${found.fullName} already has an active stay here.`
              : `Found ${found.fullName}${found.email !== null ? ` (${found.email})` : ''}.`}
          </div>
        )}

        {found !== null && !found.hasActiveTenancy && (
          <Field label="Joining date" htmlFor="assign-joining">
            <Input
              id="assign-joining"
              type="date"
              value={joiningDate}
              onChange={(event) => setJoiningDate(event.target.value)}
            />
          </Field>
        )}

        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Takes a resident off a bed. Blocked while rent is outstanding — the server
 * enforces this too (SETTLEMENT_REQUIRED), but checking client-side means the
 * owner sees why before they even try.
 */
function RemoveDialog({
  target,
  onClose,
}: {
  readonly target: {
    tenancyId: string;
    bedLabel: string;
    residentName: string;
    outstandingPaise: number;
  };
  readonly onClose: () => void;
}) {
  const exitResident = useExitResident();
  const [date, setDate] = useState(todayString());
  const [error, setError] = useState<string | null>(null);

  const blocked = target.outstandingPaise > 0;

  async function confirm(): Promise<void> {
    setError(null);
    try {
      await exitResident.mutateAsync({ id: target.tenancyId, actualExitDate: date });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not remove the resident.',
      );
    }
  }

  return (
    <Dialog
      open
      title={`Remove ${target.residentName} from bed ${target.bedLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={exitResident.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirm()}
            disabled={blocked || exitResident.isPending}
          >
            {exitResident.isPending ? 'Working…' : 'Remove from room'}
          </Button>
        </>
      }
    >
      {blocked ? (
        <div className="rounded-md bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {target.residentName} owes {formatINR(target.outstandingPaise, { withPaise: false })}.
          Settle or waive it from their resident page before removing them from the room.
        </div>
      ) : (
        <>
          <Field label="Move-out date" htmlFor="remove-date">
            <Input
              id="remove-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            The bed is released and their account reverts to a non-resident — a signed-up person
            with no room here.
          </p>
        </>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </Dialog>
  );
}
