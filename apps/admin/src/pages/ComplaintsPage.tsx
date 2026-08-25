import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
} from '@heaven/contracts';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingRows,
  PageHeader,
  Select,
  StatTile,
  Table,
  Td,
  Th,
  Textarea,
  complaintTone,
  formatDate,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import { useComplaint, useComplaints, useUpdateComplaint } from '../lib/ownerApi';

/** The owner's complaint queue: open work first. */
export function ComplaintsPage() {
  const [status, setStatus] = useState('ALL');
  const [category, setCategory] = useState('ALL');

  const complaints = useComplaints({ status, category });
  const rows = complaints.data ?? [];

  const open = rows.filter((c) => c.status === 'OPEN').length;
  const inProgress = rows.filter((c) => c.status === 'IN_PROGRESS').length;

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Raised by residents from the app. Update the status and they see it immediately."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Showing" value={String(rows.length)} />
        <StatTile label="Open" value={String(open)} tone={open > 0 ? 'danger' : 'success'} />
        <StatTile
          label="In progress"
          value={String(inProgress)}
          tone={inProgress > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Resolved"
          value={String(
            rows.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length,
          )}
          tone="success"
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="w-48">
            <Field label="Status" htmlFor="complaint-status">
              <Select
                id="complaint-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ALL">All</option>
                {COMPLAINT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {COMPLAINT_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-48">
            <Field label="Category" htmlFor="complaint-category">
              <Select
                id="complaint-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="ALL">All</option>
                {COMPLAINT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {COMPLAINT_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        {complaints.isPending ? (
          <LoadingRows />
        ) : complaints.error ? (
          <ErrorState
            message={complaints.error.message}
            onRetry={() => void complaints.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing to deal with"
            description="Complaints raised by residents will appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Raised</Th>
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Resident</Th>
                <Th>Room</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((complaint) => (
                <tr key={complaint.id} className="hover:bg-[var(--color-surface-hover)]">
                  <Td>{formatDate(complaint.createdAt)}</Td>
                  <Td>
                    <Link
                      to={`/complaints/${complaint.id}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {complaint.title}
                    </Link>
                  </Td>
                  <Td>{COMPLAINT_CATEGORY_LABELS[complaint.category]}</Td>
                  <Td>{complaint.residentName}</Td>
                  <Td>{complaint.roomNumber ?? '—'}</Td>
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
    </>
  );
}

/** One complaint, its description, and the full timeline of what happened. */
export function ComplaintDetailPage() {
  const { id = '' } = useParams();
  const { data, error, isPending, refetch } = useComplaint(id);
  const updateComplaint = useUpdateComplaint();

  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isPending) return <LoadingRows rows={8} />;

  if (error) {
    return (
      <Card>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  async function apply(status?: string): Promise<void> {
    setActionError(null);
    try {
      await updateComplaint.mutateAsync({
        id,
        ...(status === undefined ? {} : { status }),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });
      setNote('');
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : 'Could not update.');
    }
  }

  return (
    <>
      <PageHeader
        title={data.title}
        description={`${COMPLAINT_CATEGORY_LABELS[data.category]} · raised by ${data.residentName}${
          data.roomNumber === null ? '' : ` · room ${data.roomNumber}`
        } · ${formatDate(data.createdAt)}`}
        actions={
          <Link to="/complaints">
            <Button>Back</Button>
          </Link>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card title="What the resident reported">
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
              {data.description}
            </p>
            {data.imageUrl !== null && (
              <img
                src={data.imageUrl}
                alt="Attached by the resident"
                className="mt-3 max-h-64 rounded-md border border-[var(--color-border)]"
              />
            )}
            <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
              <Badge
                label={COMPLAINT_STATUS_LABELS[data.status]}
                tone={complaintTone(data.status)}
              />
              {data.reopenCount > 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  Reopened {data.reopenCount}×
                </span>
              )}
            </div>
          </Card>

          <Card title="Update">
            <Field
              label="Note"
              htmlFor="complaint-note"
              hint="Optional. The resident sees this on their complaint."
            >
              <Textarea
                id="complaint-note"
                value={note}
                onChange={(event) => setNote((event.target as HTMLTextAreaElement).value)}
                placeholder="Plumber booked for tomorrow morning."
              />
            </Field>

            <div className="mt-3 flex flex-wrap gap-2">
              {COMPLAINT_STATUSES.filter((status) => status !== data.status).map((status) => (
                <Button
                  key={status}
                  variant={status === 'RESOLVED' ? 'primary' : 'secondary'}
                  disabled={updateComplaint.isPending}
                  onClick={() => void apply(status)}
                >
                  Mark {COMPLAINT_STATUS_LABELS[status].toLowerCase()}
                </Button>
              ))}
              <Button
                disabled={note.trim() === '' || updateComplaint.isPending}
                onClick={() => void apply()}
              >
                Add note only
              </Button>
            </div>
          </Card>
        </div>

        <Card title="History">
          <ol className="flex flex-col">
            {data.events.map((event) => (
              <li
                key={event.id}
                className="border-b border-[var(--color-border)] py-2 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[var(--color-text-primary)]">
                    {event.toStatus === null
                      ? 'Note added'
                      : `Moved to ${COMPLAINT_STATUS_LABELS[event.toStatus]}`}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                    {event.actorName ?? 'System'} · {formatDate(event.createdAt)}
                  </span>
                </div>
                {event.note !== null && (
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{event.note}</p>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
