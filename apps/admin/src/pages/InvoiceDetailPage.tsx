import { PAYMENT_METHOD_LABELS } from '@heaven/contracts';
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
  Select,
  StatTile,
  Table,
  Td,
  Th,
  Textarea,
  formatDate,
  formatPeriod,
  invoiceTone,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import { useAddInvoiceItem, useInvoice, useRecordPayment, useWaiveLateFee } from '../lib/ownerApi';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** One invoice, its line items, and the payments against it. */
export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const { data, error, isPending, refetch } = useInvoice(id);

  const [payOpen, setPayOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const waiveLateFee = useWaiveLateFee();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isPending) return <LoadingRows rows={8} />;

  if (error) {
    return (
      <Card>
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const hasLateFee = data.items.some((item) => item.kind === 'LATE_FEE');
  const isWaived = data.lateFeeWaivedAt !== null;

  async function toggleWaiver(): Promise<void> {
    setActionError(null);
    try {
      await waiveLateFee.mutateAsync({ id, waived: !isWaived });
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : 'Could not update the waiver.',
      );
    }
  }

  return (
    <>
      <PageHeader
        title={data.number}
        description={`${data.residentName} · ${formatPeriod(data.periodKey)} · due ${formatDate(data.dueDate)}`}
        actions={
          <>
            <Link to="/billing">
              <Button>Back</Button>
            </Link>
            <Button onClick={() => setItemOpen(true)}>Add charge</Button>
            {(hasLateFee || isWaived) && (
              <Button onClick={() => void toggleWaiver()} disabled={waiveLateFee.isPending}>
                {isWaived ? 'Remove waiver' : 'Waive late fee'}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => setPayOpen(true)}
              disabled={data.outstandingPaise <= 0}
            >
              Record payment
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
        <StatTile label="Total" value={formatINR(data.totalPaise, { withPaise: false })} />
        <StatTile
          label="Paid"
          value={formatINR(data.amountPaidPaise, { withPaise: false })}
          tone="success"
        />
        <StatTile
          label="Outstanding"
          value={formatINR(data.outstandingPaise, { withPaise: false })}
          tone={data.outstandingPaise > 0 ? 'danger' : 'success'}
        />
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <p className="text-xs text-[var(--color-text-muted)]">Status</p>
          <div className="mt-2">
            <Badge label={data.status} tone={invoiceTone(data.status)} />
          </div>
          {isWaived && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Late fee waived</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Line items">
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    {item.description}
                    <div className="text-xs text-[var(--color-text-muted)]">{item.kind}</div>
                  </Td>
                  <Td align="right" className="tabular">
                    {formatINR(item.amountPaise, { withPaise: false })}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-semibold">Total</Td>
                <Td align="right" className="tabular font-semibold">
                  {formatINR(data.totalPaise, { withPaise: false })}
                </Td>
              </tr>
            </tbody>
          </Table>
        </Card>

        <Card title="Payments against this invoice">
          {data.payments.length === 0 ? (
            <EmptyState
              title="Nothing paid yet"
              description="Record a cash, UPI or bank payment when it arrives."
              action={
                <Button variant="primary" onClick={() => setPayOpen(true)}>
                  Record payment
                </Button>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th>Reference</Th>
                  <Th align="right">Applied</Th>
                  <Th>Receipt</Th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <Td>{formatDate(payment.paidAt ?? payment.createdAt)}</Td>
                    <Td>{PAYMENT_METHOD_LABELS[payment.method]}</Td>
                    <Td className="text-xs">{payment.reference ?? '—'}</Td>
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
      </div>

      {payOpen && (
        <RecordPaymentDialog
          tenancyId={data.tenancyId}
          invoiceId={data.id}
          suggestedPaise={data.outstandingPaise}
          residentName={data.residentName}
          onClose={() => setPayOpen(false)}
        />
      )}
      {itemOpen && <AddItemDialog invoiceId={data.id} onClose={() => setItemOpen(false)} />}
    </>
  );
}

/**
 * Recording a payment the owner received outside the app.
 *
 * The amount is applied oldest-invoice-first by the server; anything left over
 * is held as the resident's credit rather than forced onto this invoice.
 */
export function RecordPaymentDialog({
  tenancyId,
  invoiceId,
  suggestedPaise,
  residentName,
  onClose,
}: {
  readonly tenancyId: string;
  readonly invoiceId?: string;
  readonly suggestedPaise: number;
  readonly residentName: string;
  readonly onClose: () => void;
}) {
  const recordPayment = useRecordPayment();
  const [form, setForm] = useState({
    amount: String(suggestedPaise / 100),
    method: 'UPI',
    paidAt: todayString(),
    reference: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await recordPayment.mutateAsync({
        tenancyId,
        ...(invoiceId === undefined ? {} : { invoiceId }),
        amountPaise: Math.round(Number(form.amount) * 100),
        method: form.method,
        paidAt: form.paidAt,
        ...(form.reference.trim() === '' ? {} : { reference: form.reference.trim() }),
        ...(form.notes.trim() === '' ? {} : { notes: form.notes.trim() }),
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not record the payment.',
      );
    }
  }

  const amount = Number(form.amount);
  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <Dialog
      open
      title={`Record payment from ${residentName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!valid || recordPayment.isPending}
          >
            {recordPayment.isPending ? 'Recording…' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)" htmlFor="pay-amount">
          <Input
            id="pay-amount"
            type="number"
            min={1}
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            autoFocus
          />
        </Field>

        <Field label="Method" htmlFor="pay-method">
          <Select
            id="pay-method"
            value={form.method}
            onChange={(event) => setForm({ ...form, method: event.target.value })}
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </Select>
        </Field>

        <Field label="Date received" htmlFor="pay-date">
          <Input
            id="pay-date"
            type="date"
            value={form.paidAt}
            onChange={(event) => setForm({ ...form, paidAt: event.target.value })}
          />
        </Field>

        <Field
          label="Reference / UTR"
          htmlFor="pay-reference"
          hint="Optional, but useful for UPI and bank transfers."
        >
          <Input
            id="pay-reference"
            value={form.reference}
            onChange={(event) => setForm({ ...form, reference: event.target.value })}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="pay-notes">
            <Textarea
              id="pay-notes"
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: (event.target as HTMLTextAreaElement).value })
              }
            />
          </Field>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] sm:col-span-2">
          A receipt is issued automatically. Anything above the outstanding amount is held as credit
          against the resident&apos;s next invoice.
        </p>

        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)] sm:col-span-2">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function AddItemDialog({
  invoiceId,
  onClose,
}: {
  readonly invoiceId: string;
  readonly onClose: () => void;
}) {
  const addItem = useAddInvoiceItem();
  const [form, setForm] = useState({ kind: 'OTHER', description: '', amount: '' });
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await addItem.mutateAsync({
        id: invoiceId,
        kind: form.kind,
        description: form.description.trim(),
        amountPaise: Math.round(Number(form.amount) * 100),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the item.');
    }
  }

  return (
    <Dialog
      open
      title="Add a charge or discount"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={form.description.trim() === '' || form.amount === '' || addItem.isPending}
          >
            {addItem.isPending ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Type" htmlFor="item-kind">
          <Select
            id="item-kind"
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value })}
          >
            <option value="OTHER">Additional charge</option>
            <option value="DISCOUNT">Discount</option>
          </Select>
        </Field>

        <Field
          label="Description"
          htmlFor="item-description"
          hint="Shown to the resident on their bill, so be specific."
        >
          <Input
            id="item-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder={form.kind === 'DISCOUNT' ? 'Goodwill adjustment' : 'Laundry — extra load'}
          />
        </Field>

        <Field
          label="Amount (₹)"
          htmlFor="item-amount"
          hint={
            form.kind === 'DISCOUNT'
              ? 'Entered as a positive number; applied as a reduction.'
              : undefined
          }
        >
          <Input
            id="item-amount"
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
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
