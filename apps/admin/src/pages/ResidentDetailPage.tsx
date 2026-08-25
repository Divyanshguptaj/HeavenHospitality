import { COMPLAINT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

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
  StatTile,
  Table,
  Td,
  Th,
  complaintTone,
  formatDate,
  formatPeriod,
  invoiceTone,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import {
  useExitResident,
  useMoveResident,
  useOccupancy,
  useResident,
  useUpdateResident,
} from '../lib/ownerApi';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Everything about one resident: placement, money, electricity, complaints. */
export function ResidentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, isPending, refetch } = useResident(id);

  const [moveOpen, setMoveOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const exitResident = useExitResident();

  if (isPending) return <LoadingRows rows={10} />;

  if (error) {
    return (
      <Card>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  async function confirmExit(exitDate: string): Promise<void> {
    setActionError(null);
    try {
      await exitResident.mutateAsync({ id, actualExitDate: exitDate });
      setExitOpen(false);
      void navigate('/residents');
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : 'Could not complete the move-out.',
      );
    }
  }

  return (
    <>
      <PageHeader
        title={data.fullName}
        description={`${data.email ?? data.phone ?? ''} · joined ${formatDate(data.joiningDate)}`}
        actions={
          <>
            <Link to="/residents">
              <Button>Back</Button>
            </Link>
            <Button onClick={() => setEditOpen(true)}>Edit</Button>
            <Button onClick={() => setMoveOpen(true)} disabled={data.status === 'VACATED'}>
              Move
            </Button>
            <Button
              variant="danger"
              onClick={() => setExitOpen(true)}
              disabled={data.status === 'VACATED'}
            >
              Move out
            </Button>
          </>
        }
      />

      {actionError !== null && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {actionError}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={formatINR(data.outstandingPaise, { withPaise: false })}
          tone={data.outstandingPaise > 0 ? 'danger' : 'success'}
        />
        <StatTile
          label="Monthly rent"
          value={formatINR(data.monthlyRentPaise, { withPaise: false })}
          hint={data.monthlyRentOverridePaise === null ? "room's rent" : 'override'}
        />
        <StatTile
          label="Deposit held"
          value={formatINR(data.securityDepositPaise, { withPaise: false })}
        />
        <StatTile
          label="Placement"
          value={data.bed === null ? 'Unassigned' : `${data.bed.roomNumber} · ${data.bed.bedLabel}`}
          hint={data.bed?.floorName}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Invoices">
          {data.invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Generate them from the Billing page."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Period</Th>
                  <Th>Due</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Outstanding</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td>
                      <Link
                        to={`/billing/${invoice.id}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {formatPeriod(invoice.periodKey)}
                      </Link>
                    </Td>
                    <Td>{formatDate(invoice.dueDate)}</Td>
                    <Td align="right" className="tabular">
                      {formatINR(invoice.totalPaise, { withPaise: false })}
                    </Td>
                    <Td align="right" className="tabular">
                      {formatINR(invoice.outstandingPaise, { withPaise: false })}
                    </Td>
                    <Td>
                      <Badge label={invoice.status} tone={invoiceTone(invoice.status)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Payments">
          {data.payments.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th>Receipt</Th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <Td>{formatDate(payment.paidAt ?? payment.createdAt)}</Td>
                    <Td>{PAYMENT_METHOD_LABELS[payment.method]}</Td>
                    <Td align="right" className="tabular">
                      {formatINR(payment.amountPaise, { withPaise: false })}
                    </Td>
                    <Td className="text-xs text-[var(--color-text-muted)]">
                      {payment.receiptNumber ?? '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Electricity">
          {data.electricity.length === 0 ? (
            <EmptyState title="No readings yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Period</Th>
                  <Th>Room</Th>
                  <Th align="right">Units</Th>
                  <Th align="right">Days</Th>
                  <Th align="right">Share</Th>
                </tr>
              </thead>
              <tbody>
                {data.electricity.map((entry) => (
                  <tr key={`${entry.periodKey}-${entry.roomNumber}`}>
                    <Td>{formatPeriod(entry.periodKey)}</Td>
                    <Td>{entry.roomNumber}</Td>
                    <Td align="right" className="tabular">
                      {entry.units}
                    </Td>
                    <Td align="right" className="tabular">
                      {entry.occupiedDays}
                    </Td>
                    <Td align="right" className="tabular">
                      {formatINR(entry.sharePaise, { withPaise: false })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Complaints">
          {data.complaints.length === 0 ? (
            <EmptyState title="No complaints raised" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Raised</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.complaints.map((complaint) => (
                  <tr key={complaint.id}>
                    <Td>{formatDate(complaint.createdAt)}</Td>
                    <Td>
                      <Link
                        to={`/complaints/${complaint.id}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {complaint.title}
                      </Link>
                    </Td>
                    <Td>
                      <Badge
                        label={COMPLAINT_STATUS_LABELS[complaint.status]}
                        tone={complaintTone(complaint.status)}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {moveOpen && (
        <MoveDialog
          tenancyId={id}
          currentBedId={data.bed?.bedId ?? null}
          onClose={() => setMoveOpen(false)}
        />
      )}
      {editOpen && (
        <EditResidentDialog
          tenancyId={id}
          initial={{
            fullName: data.fullName,
            phone: data.phone ?? '',
            expectedExitDate: data.expectedExitDate ?? '',
            deposit: String(data.securityDepositPaise / 100),
            status: data.status,
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
      <ExitDialog
        open={exitOpen}
        busy={exitResident.isPending}
        onCancel={() => setExitOpen(false)}
        onConfirm={(date) => void confirmExit(date)}
      />
    </>
  );
}

function MoveDialog({
  tenancyId,
  currentBedId,
  onClose,
}: {
  readonly tenancyId: string;
  readonly currentBedId: string | null;
  readonly onClose: () => void;
}) {
  const occupancy = useOccupancy();
  const moveResident = useMoveResident();
  const [bedId, setBedId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const freeBeds = (occupancy.data?.floors ?? []).flatMap((floor) =>
    floor.rooms.flatMap((room) =>
      room.beds
        .filter((bed) => bed.status === 'AVAILABLE' && bed.id !== currentBedId)
        .map((bed) => ({
          id: bed.id,
          label: `Room ${room.number} · Bed ${bed.label} — ${formatINR(room.monthlyRentPaise, { withPaise: false })}`,
        })),
    ),
  );

  async function submit(): Promise<void> {
    setError(null);
    try {
      await moveResident.mutateAsync({ id: tenancyId, toBedId: bedId });
      onClose();
    } catch (caught) {
      // If someone else took the bed a moment ago, the database refuses and the
      // server returns BED_ALREADY_ALLOCATED — show that, do not retry blindly.
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not move the resident.');
    }
  }

  return (
    <Dialog
      open
      title="Move to another bed"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={bedId === '' || moveResident.isPending}
          >
            {moveResident.isPending ? 'Moving…' : 'Move'}
          </Button>
        </>
      }
    >
      <Field
        label="New bed"
        htmlFor="move-bed"
        hint="The old bed is released and the change is recorded in their history."
      >
        <Select id="move-bed" value={bedId} onChange={(event) => setBedId(event.target.value)}>
          <option value="">Select a bed</option>
          {freeBeds.map((bed) => (
            <option key={bed.id} value={bed.id}>
              {bed.label}
            </option>
          ))}
        </Select>
      </Field>
      {freeBeds.length === 0 && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          No other beds are free. Free one up first, or mark a bed available in Occupancy.
        </p>
      )}
      {error !== null && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function ExitDialog({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (date: string) => void;
}) {
  const [date, setDate] = useState(todayString());

  return (
    <Dialog
      open={open}
      title="Record move-out"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(date)} disabled={busy}>
            {busy ? 'Working…' : 'Confirm move-out'}
          </Button>
        </>
      }
    >
      <Field label="Move-out date" htmlFor="exit-date">
        <Input
          id="exit-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
        The bed is released and the stay is closed. Any unpaid invoices remain — moving out does not
        cancel what is owed.
      </p>
    </Dialog>
  );
}

function EditResidentDialog({
  tenancyId,
  initial,
  onClose,
}: {
  readonly tenancyId: string;
  readonly initial: {
    fullName: string;
    phone: string;
    expectedExitDate: string;
    deposit: string;
    status: string;
  };
  readonly onClose: () => void;
}) {
  const updateResident = useUpdateResident();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await updateResident.mutateAsync({
        id: tenancyId,
        fullName: form.fullName.trim(),
        phone: form.phone.trim() === '' ? null : form.phone.trim(),
        expectedExitDate: form.expectedExitDate === '' ? null : form.expectedExitDate,
        securityDepositPaise: Math.round(Number(form.deposit || '0') * 100),
        status: form.status,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <Dialog
      open
      title="Edit resident"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={updateResident.isPending}
          >
            {updateResident.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" htmlFor="edit-name">
          <Input
            id="edit-name"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
        </Field>
        <Field label="Phone" htmlFor="edit-phone">
          <Input
            id="edit-phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field label="Expected leaving date" htmlFor="edit-exit">
          <Input
            id="edit-exit"
            type="date"
            value={form.expectedExitDate}
            onChange={(event) => setForm({ ...form, expectedExitDate: event.target.value })}
          />
        </Field>
        <Field label="Security deposit (₹)" htmlFor="edit-deposit">
          <Input
            id="edit-deposit"
            type="number"
            min={0}
            value={form.deposit}
            onChange={(event) => setForm({ ...form, deposit: event.target.value })}
          />
        </Field>
        <Field
          label="Status"
          htmlFor="edit-status"
          hint="Use Move out to end a stay — it also releases the bed."
        >
          <Select
            id="edit-status"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
          >
            <option value="ACTIVE">Active</option>
            <option value="NOTICE_PERIOD">On notice</option>
          </Select>
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
