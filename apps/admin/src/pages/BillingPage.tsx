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
  StatTile,
  Table,
  Td,
  Th,
  formatDate,
  formatPeriod,
  invoiceTone,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import { useGenerateInvoices, useInvoices } from '../lib/ownerApi';

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Recent periods for the filter, newest first. */
function recentPeriods(count = 12): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_unused, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function BillingPage() {
  const [periodKey, setPeriodKey] = useState(currentPeriod());
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);

  const invoices = useInvoices({
    periodKey,
    ...(status === 'ALL' ? {} : { status }),
    ...(search === '' ? {} : { search }),
  });

  const rows = invoices.data ?? [];
  const totals = rows.reduce(
    (accumulator, invoice) => ({
      billed: accumulator.billed + invoice.totalPaise,
      collected: accumulator.collected + invoice.amountPaidPaise,
      outstanding: accumulator.outstanding + invoice.outstandingPaise,
    }),
    { billed: 0, collected: 0, outstanding: 0 },
  );

  return (
    <>
      <PageHeader
        title="Billing"
        description="Monthly invoices. Rent is pro-rated for part months and electricity is added from meter readings."
        actions={
          <Button variant="primary" onClick={() => setGenerateOpen(true)}>
            Generate invoices
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Invoices" value={String(rows.length)} />
        <StatTile label="Billed" value={formatINR(totals.billed, { withPaise: false })} />
        <StatTile
          label="Collected"
          value={formatINR(totals.collected, { withPaise: false })}
          tone="success"
        />
        <StatTile
          label="Outstanding"
          value={formatINR(totals.outstanding, { withPaise: false })}
          tone={totals.outstanding > 0 ? 'danger' : 'success'}
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="w-48">
            <Field label="Period" htmlFor="billing-period">
              <Select
                id="billing-period"
                value={periodKey}
                onChange={(event) => setPeriodKey(event.target.value)}
              >
                {recentPeriods().map((period) => (
                  <option key={period} value={period}>
                    {formatPeriod(period)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-44">
            <Field label="Status" htmlFor="billing-status">
              <Select
                id="billing-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ALL">All</option>
                <option value="UNPAID">Unpaid (any)</option>
                <option value="ISSUED">Issued</option>
                <option value="PARTIALLY_PAID">Partially paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PAID">Paid</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-56 flex-1">
            <Field label="Search" htmlFor="billing-search">
              <Input
                id="billing-search"
                placeholder="Resident name or invoice number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        {invoices.isPending ? (
          <LoadingRows />
        ) : invoices.error ? (
          <ErrorState message={invoices.error.message} onRetry={() => void invoices.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No invoices for ${formatPeriod(periodKey)}`}
            description="Generate them once the month has started. Running it twice is safe — existing invoices are skipped."
            action={
              <Button variant="primary" onClick={() => setGenerateOpen(true)}>
                Generate invoices
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Resident</Th>
                <Th>Room</Th>
                <Th>Due</Th>
                <Th align="right">Total</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Outstanding</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-[var(--color-surface-hover)]">
                  <Td>
                    <Link
                      to={`/billing/${invoice.id}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </Td>
                  <Td>
                    <Link to={`/residents/${invoice.tenancyId}`} className="hover:underline">
                      {invoice.residentName}
                    </Link>
                  </Td>
                  <Td>{invoice.roomNumber ?? '—'}</Td>
                  <Td>{formatDate(invoice.dueDate)}</Td>
                  <Td align="right" className="tabular">
                    {formatINR(invoice.totalPaise, { withPaise: false })}
                  </Td>
                  <Td align="right" className="tabular">
                    {formatINR(invoice.amountPaidPaise, { withPaise: false })}
                  </Td>
                  <Td align="right" className="tabular">
                    <span
                      style={{
                        color:
                          invoice.outstandingPaise > 0
                            ? 'var(--color-danger)'
                            : 'var(--color-text-secondary)',
                      }}
                    >
                      {formatINR(invoice.outstandingPaise, { withPaise: false })}
                    </span>
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

      {generateOpen && (
        <GenerateDialog defaultPeriod={periodKey} onClose={() => setGenerateOpen(false)} />
      )}
    </>
  );
}

/**
 * Generating a month's invoices.
 *
 * Safe to run more than once: the database refuses a second invoice for the same
 * resident and period, so a repeat run reports skips rather than double-billing.
 */
function GenerateDialog({
  defaultPeriod,
  onClose,
}: {
  readonly defaultPeriod: string;
  readonly onClose: () => void;
}) {
  const generate = useGenerateInvoices();
  const [periodKey, setPeriodKey] = useState(defaultPeriod);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      setResult(await generate.mutateAsync(periodKey));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not generate invoices.');
    }
  }

  return (
    <Dialog
      open
      title="Generate invoices"
      onClose={onClose}
      footer={
        result === null ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={generate.isPending}>
              {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      {result === null ? (
        <>
          <Field label="Billing period" htmlFor="generate-period">
            <Select
              id="generate-period"
              value={periodKey}
              onChange={(event) => setPeriodKey(event.target.value)}
            >
              {recentPeriods().map((period) => (
                <option key={period} value={period}>
                  {formatPeriod(period)}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            One invoice per active resident. Rent is pro-rated for anyone who joined or left
            mid-month, and any electricity recorded for the period is included.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Running this twice is safe — residents who already have an invoice are skipped.
          </p>
          {error !== null && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--color-text-primary)]">
          {result.created} invoice{result.created === 1 ? '' : 's'} created
          {result.skipped > 0 && `, ${result.skipped} skipped (already invoiced or not resident)`}.
        </p>
      )}
    </Dialog>
  );
}
