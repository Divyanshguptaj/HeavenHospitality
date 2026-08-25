import { PAYMENT_METHOD_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
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
  formatDate,
} from '../components/ui';
import { usePayments, useResidents } from '../lib/ownerApi';
import { RecordPaymentDialog } from './InvoiceDetailPage';

/** Every payment received, however it arrived. */
export function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [recordFor, setRecordFor] = useState<{ tenancyId: string; name: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const payments = usePayments(search === '' ? undefined : search);
  const rows = payments.data ?? [];

  const total = rows
    .filter((payment) => payment.status === 'PAID')
    .reduce((sum, payment) => sum + payment.amountPaise, 0);
  const credit = rows.reduce((sum, payment) => sum + payment.unallocatedPaise, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Cash, UPI and bank transfers you have recorded, plus payments made in the app."
        actions={
          <Button variant="primary" onClick={() => setPickerOpen(true)}>
            Record payment
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Payments" value={String(rows.length)} />
        <StatTile label="Received" value={formatINR(total, { withPaise: false })} tone="success" />
        <StatTile
          label="Held as credit"
          value={formatINR(credit, { withPaise: false })}
          hint="Overpayments applied to future invoices"
        />
      </div>

      <Card className="mb-4">
        <div className="max-w-md">
          <Field label="Search" htmlFor="payment-search">
            <Input
              id="payment-search"
              placeholder="Resident name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        {payments.isPending ? (
          <LoadingRows />
        ) : payments.error ? (
          <ErrorState message={payments.error.message} onRetry={() => void payments.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Record one when a resident pays you in cash or by transfer."
            action={
              <Button variant="primary" onClick={() => setPickerOpen(true)}>
                Record payment
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Resident</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Credit</Th>
                <Th>Receipt</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.id} className="hover:bg-[var(--color-surface-hover)]">
                  <Td>{formatDate(payment.paidAt ?? payment.createdAt)}</Td>
                  <Td>
                    <Link
                      to={`/residents/${payment.tenancyId}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {payment.residentName}
                    </Link>
                  </Td>
                  <Td>{PAYMENT_METHOD_LABELS[payment.method]}</Td>
                  <Td className="text-xs">{payment.reference ?? '—'}</Td>
                  <Td align="right" className="tabular">
                    {formatINR(payment.amountPaise, { withPaise: false })}
                  </Td>
                  <Td align="right" className="tabular">
                    {payment.unallocatedPaise > 0
                      ? formatINR(payment.unallocatedPaise, { withPaise: false })
                      : '—'}
                  </Td>
                  <Td className="text-xs text-[var(--color-text-muted)]">
                    {payment.receiptNumber ?? '—'}
                  </Td>
                  <Td>
                    <Badge
                      label={payment.status}
                      tone={payment.status === 'PAID' ? 'success' : 'warning'}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {pickerOpen && (
        <ResidentPicker
          onCancel={() => setPickerOpen(false)}
          onPick={(tenancyId, name) => {
            setPickerOpen(false);
            setRecordFor({ tenancyId, name });
          }}
        />
      )}

      {recordFor !== null && (
        <RecordPaymentDialog
          tenancyId={recordFor.tenancyId}
          suggestedPaise={0}
          residentName={recordFor.name}
          onClose={() => setRecordFor(null)}
        />
      )}
    </>
  );
}

/** Picking who paid, before recording the payment itself. */
function ResidentPicker({
  onCancel,
  onPick,
}: {
  readonly onCancel: () => void;
  readonly onPick: (tenancyId: string, name: string) => void;
}) {
  const residents = useResidents({ status: 'ACTIVE' });
  const [tenancyId, setTenancyId] = useState('');

  const selected = (residents.data ?? []).find((r) => r.tenancyId === tenancyId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Choose resident"
    >
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Who made the payment?
        </h2>
        <Field label="Resident" htmlFor="picker-resident">
          <Select
            id="picker-resident"
            value={tenancyId}
            onChange={(event) => setTenancyId(event.target.value)}
          >
            <option value="">Select a resident</option>
            {(residents.data ?? []).map((resident) => (
              <option key={resident.tenancyId} value={resident.tenancyId}>
                {resident.fullName}
                {resident.outstandingPaise > 0
                  ? ` — owes ${formatINR(resident.outstandingPaise, { withPaise: false })}`
                  : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={selected === undefined}
            onClick={() => {
              if (selected !== undefined) onPick(selected.tenancyId, selected.fullName);
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
