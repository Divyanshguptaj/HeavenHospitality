import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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
  Select,
  Table,
  Td,
  Th,
  formatDate,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import { lookupUserByEmail, useCreateResident, useOccupancy, useResidents } from '../lib/ownerApi';

/** Today, for date inputs. */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ResidentsPage() {
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const residents = useResidents({
    ...(status === 'ALL' ? {} : { status }),
    ...(search === '' ? {} : { search }),
  });

  return (
    <>
      <PageHeader
        title="Residents"
        description="Everyone living here, past and present."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            Add resident
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Search" htmlFor="resident-search">
              <Input
                id="resident-search"
                placeholder="Name, email or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
          </div>
          <div className="w-44">
            <Field label="Status" htmlFor="resident-status">
              <Select
                id="resident-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ACTIVE">Active</option>
                <option value="NOTICE_PERIOD">On notice</option>
                <option value="VACATED">Moved out</option>
                <option value="ALL">All</option>
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        {residents.isPending ? (
          <LoadingRows />
        ) : residents.error ? (
          <ErrorState message={residents.error.message} onRetry={() => void residents.refetch()} />
        ) : residents.data.length === 0 ? (
          <EmptyState
            title={search === '' ? 'No residents yet' : 'No matches'}
            description={
              search === ''
                ? 'Add your first resident and assign them a bed.'
                : 'Try a different name, email or phone number.'
            }
            action={
              search === '' ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  Add resident
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Resident</Th>
                <Th>Room / bed</Th>
                <Th>Joined</Th>
                <Th>Leaves</Th>
                <Th align="right">Rent</Th>
                <Th align="right">Outstanding</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {residents.data.map((resident) => (
                <tr key={resident.tenancyId} className="hover:bg-[var(--color-surface-hover)]">
                  <Td>
                    <Link
                      to={`/residents/${resident.tenancyId}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {resident.fullName}
                    </Link>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {resident.email ?? resident.phone ?? '—'}
                    </div>
                  </Td>
                  <Td>
                    {resident.bed === null ? (
                      <span className="text-[var(--color-text-muted)]">Unassigned</span>
                    ) : (
                      <>
                        {resident.bed.roomNumber} · {resident.bed.bedLabel}
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {resident.bed.floorName}
                        </div>
                      </>
                    )}
                  </Td>
                  <Td>{formatDate(resident.joiningDate)}</Td>
                  <Td>{formatDate(resident.expectedExitDate)}</Td>
                  <Td align="right" className="tabular">
                    {formatINR(resident.monthlyRentPaise, { withPaise: false })}
                  </Td>
                  <Td align="right" className="tabular">
                    <span
                      style={{
                        color:
                          resident.outstandingPaise > 0
                            ? 'var(--color-danger)'
                            : 'var(--color-text-secondary)',
                      }}
                    >
                      {formatINR(resident.outstandingPaise, { withPaise: false })}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      label={resident.status === 'NOTICE_PERIOD' ? 'On notice' : resident.status}
                      tone={
                        resident.status === 'ACTIVE'
                          ? 'success'
                          : resident.status === 'NOTICE_PERIOD'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {addOpen && <AddResidentDialog onClose={() => setAddOpen(false)} />}
    </>
  );
}

/**
 * Adding a resident.
 *
 * Looks the email up first: someone who has lived here before already has an
 * account, and creating a second one would split their history in two.
 */
function AddResidentDialog({ onClose }: { readonly onClose: () => void }) {
  const createResident = useCreateResident();
  const occupancy = useOccupancy();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    joiningDate: todayString(),
    expectedExitDate: '',
    bedId: '',
    deposit: '',
    rentOverride: '',
  });
  const [existing, setExisting] = useState<{
    id: string;
    fullName: string;
    hasActiveTenancy: boolean;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freeBeds = (occupancy.data?.floors ?? []).flatMap((floor) =>
    floor.rooms.flatMap((room) =>
      room.beds
        .filter((bed) => bed.status === 'AVAILABLE')
        .map((bed) => ({
          id: bed.id,
          label: `Room ${room.number} · Bed ${bed.label} — ${formatINR(room.monthlyRentPaise, { withPaise: false })}`,
        })),
    ),
  );

  async function checkEmail(): Promise<void> {
    const email = form.email.trim().toLowerCase();
    if (email === '') return;

    setChecking(true);
    setError(null);
    try {
      const found = await lookupUserByEmail(email);
      setExisting(found);
      if (found !== null && form.fullName === '') {
        setForm((current) => ({ ...current, fullName: found.fullName }));
      }
    } catch {
      // A failed lookup must not block adding someone; the server re-checks.
      setExisting(null);
    } finally {
      setChecking(false);
    }
  }

  async function submit(): Promise<void> {
    setError(null);
    try {
      await createResident.mutateAsync({
        ...(existing === null ? {} : { existingUserId: existing.id }),
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        ...(form.phone.trim() === '' ? {} : { phone: form.phone.trim() }),
        joiningDate: form.joiningDate,
        ...(form.expectedExitDate === '' ? {} : { expectedExitDate: form.expectedExitDate }),
        ...(form.bedId === '' ? {} : { bedId: form.bedId }),
        securityDepositPaise: Math.round(Number(form.deposit || '0') * 100),
        ...(form.rentOverride === ''
          ? {}
          : { monthlyRentOverridePaise: Math.round(Number(form.rentOverride) * 100) }),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the resident.');
    }
  }

  const canSubmit =
    form.fullName.trim() !== '' &&
    form.email.trim() !== '' &&
    form.joiningDate !== '' &&
    existing?.hasActiveTenancy !== true &&
    !createResident.isPending;

  return (
    <Dialog
      open
      title="Add resident"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {createResident.isPending ? 'Adding…' : 'Add resident'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Email"
            htmlFor="resident-email"
            hint="We check whether this person already has an account."
          >
            <Input
              id="resident-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              onBlur={() => void checkEmail()}
              autoFocus
            />
          </Field>
        </div>

        {checking && (
          <p className="text-xs text-[var(--color-text-muted)] sm:col-span-2">Checking…</p>
        )}

        {existing !== null && (
          <div
            className={`rounded-md px-3 py-2 text-sm sm:col-span-2 ${
              existing.hasActiveTenancy
                ? 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]'
                : 'bg-[var(--color-info-subtle)] text-[var(--color-info)]'
            }`}
          >
            {existing.hasActiveTenancy
              ? `${existing.fullName} already has an active stay here.`
              : `${existing.fullName} already has an account — it will be reused, not duplicated.`}
          </div>
        )}

        <Field label="Full name" htmlFor="resident-name">
          <Input
            id="resident-name"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
        </Field>

        <Field label="Phone" htmlFor="resident-phone">
          <Input
            id="resident-phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>

        <Field label="Joining date" htmlFor="resident-joining">
          <Input
            id="resident-joining"
            type="date"
            value={form.joiningDate}
            onChange={(event) => setForm({ ...form, joiningDate: event.target.value })}
          />
        </Field>

        <Field
          label="Expected leaving date"
          htmlFor="resident-exit"
          hint="Optional. Drives the upcoming-vacancy list."
        >
          <Input
            id="resident-exit"
            type="date"
            value={form.expectedExitDate}
            onChange={(event) => setForm({ ...form, expectedExitDate: event.target.value })}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Bed"
            htmlFor="resident-bed"
            hint={
              freeBeds.length === 0
                ? 'No beds are free. You can add the resident now and assign one later.'
                : 'Only free beds are listed.'
            }
          >
            <Select
              id="resident-bed"
              value={form.bedId}
              onChange={(event) => setForm({ ...form, bedId: event.target.value })}
            >
              <option value="">Assign later</option>
              {freeBeds.map((bed) => (
                <option key={bed.id} value={bed.id}>
                  {bed.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Security deposit (₹)" htmlFor="resident-deposit">
          <Input
            id="resident-deposit"
            type="number"
            min={0}
            value={form.deposit}
            onChange={(event) => setForm({ ...form, deposit: event.target.value })}
          />
        </Field>

        <Field
          label="Rent override (₹)"
          htmlFor="resident-rent"
          hint="Leave blank to use the room's rent."
        >
          <Input
            id="resident-rent"
            type="number"
            min={0}
            value={form.rentOverride}
            onChange={(event) => setForm({ ...form, rentOverride: event.target.value })}
          />
        </Field>

        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)] sm:col-span-2">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
