import { formatINR } from '@heaven/money';
import { useEffect, useState } from 'react';

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
} from '../components/ui';
import { ApiRequestError, apiRequest } from '../lib/apiClient';
import { useElectricity, useRecordReading, useRooms, useSettings } from '../lib/ownerApi';

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function recentPeriods(count = 12): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_unused, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * Electricity: the owner types two meter numbers, the server does the rest.
 *
 * The charge is split across whoever occupied the room that month, weighted by
 * how many days each was there — so someone who moved in on the 25th pays for
 * six days, not a third of the bill.
 */
export function ElectricityPage() {
  const [periodKey, setPeriodKey] = useState(currentPeriod());
  const [addOpen, setAddOpen] = useState(false);

  const readings = useElectricity({ periodKey });
  const settings = useSettings();

  const rows = readings.data ?? [];
  const totals = rows
    .filter((reading) => reading.status === 'ACTIVE')
    .reduce(
      (accumulator, reading) => ({
        units: accumulator.units + reading.units,
        amount: accumulator.amount + reading.amountPaise,
      }),
      { units: 0, amount: 0 },
    );

  return (
    <>
      <PageHeader
        title="Electricity"
        description="Enter the month's meter readings. The bill is calculated and split automatically."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            Add reading
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Rooms read"
          value={String(rows.filter((r) => r.status === 'ACTIVE').length)}
        />
        <StatTile label="Units" value={String(totals.units)} />
        <StatTile label="Billed" value={formatINR(totals.amount, { withPaise: false })} />
        <StatTile
          label="Rate"
          value={
            settings.data === undefined
              ? '—'
              : `${formatINR(settings.data.financial.electricityRatePaisePerUnit)}/unit`
          }
          hint="Change it in Settings"
        />
      </div>

      <Card className="mb-4">
        <div className="w-56">
          <Field label="Period" htmlFor="electricity-period">
            <Select
              id="electricity-period"
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
      </Card>

      <Card>
        {readings.isPending ? (
          <LoadingRows />
        ) : readings.error ? (
          <ErrorState message={readings.error.message} onRetry={() => void readings.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No readings for ${formatPeriod(periodKey)}`}
            description="Add a reading for each occupied room at the end of the month."
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                Add reading
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Room</Th>
                <Th align="right">Previous</Th>
                <Th align="right">Current</Th>
                <Th align="right">Units</Th>
                <Th align="right">Amount</Th>
                <Th>Split between</Th>
                <Th>Read on</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((reading) => (
                <tr
                  key={reading.id}
                  className={reading.status === 'CORRECTED' ? 'opacity-50' : undefined}
                >
                  <Td>
                    {reading.roomNumber}
                    {reading.status === 'CORRECTED' && (
                      <span className="ml-2">
                        <Badge label="Superseded" tone="neutral" />
                      </span>
                    )}
                  </Td>
                  <Td align="right" className="tabular">
                    {reading.previousReading}
                  </Td>
                  <Td align="right" className="tabular">
                    {reading.currentReading}
                  </Td>
                  <Td align="right" className="tabular">
                    {reading.units}
                  </Td>
                  <Td align="right" className="tabular">
                    {formatINR(reading.amountPaise, { withPaise: false })}
                  </Td>
                  <Td className="text-xs">
                    {reading.shares.length === 0 ? (
                      <span className="text-[var(--color-text-muted)]">Room was empty</span>
                    ) : (
                      reading.shares.map((share) => (
                        <div key={share.tenancyId}>
                          {share.residentName} — {formatINR(share.sharePaise, { withPaise: false })}{' '}
                          <span className="text-[var(--color-text-muted)]">
                            ({share.occupiedDays}d)
                          </span>
                        </div>
                      ))
                    )}
                  </Td>
                  <Td>{formatDate(reading.readingDate)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {addOpen && <AddReadingDialog defaultPeriod={periodKey} onClose={() => setAddOpen(false)} />}
    </>
  );
}

function AddReadingDialog({
  defaultPeriod,
  onClose,
}: {
  readonly defaultPeriod: string;
  readonly onClose: () => void;
}) {
  const rooms = useRooms();
  const settings = useSettings();
  const recordReading = useRecordReading();

  const [form, setForm] = useState({
    roomId: '',
    periodKey: defaultPeriod,
    previous: '',
    current: '',
    readingDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);

  /**
   * Pre-fills "previous" from the room's last reading. Re-typing that number is
   * the likeliest place for a transcription error, and an error there mis-bills
   * everyone in the room.
   */
  useEffect(() => {
    if (form.roomId === '') return;

    let cancelled = false;
    void apiRequest<{ currentReading: number } | null>(`/owner/electricity/last/${form.roomId}`)
      .then((result) => {
        if (!cancelled && result.data !== null) {
          setForm((current) => ({
            ...current,
            previous: String(result.data?.currentReading ?? ''),
          }));
        }
      })
      .catch(() => {
        // No prior reading is normal for a new meter; leave the field blank.
      });

    return () => {
      cancelled = true;
    };
  }, [form.roomId]);

  const previous = Number(form.previous);
  const current = Number(form.current);
  const units = Number.isFinite(previous) && Number.isFinite(current) ? current - previous : 0;
  const rate = settings.data?.financial.electricityRatePaisePerUnit ?? 0;
  const preview = units > 0 ? units * rate : 0;
  const backwards = form.current !== '' && current < previous;

  async function submit(): Promise<void> {
    setError(null);
    try {
      await recordReading.mutateAsync({
        roomId: form.roomId,
        periodKey: form.periodKey,
        previousReading: previous,
        currentReading: current,
        readingDate: form.readingDate,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save the reading.');
    }
  }

  return (
    <Dialog
      open
      title="Add meter reading"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={
              form.roomId === '' ||
              form.previous === '' ||
              form.current === '' ||
              backwards ||
              recordReading.isPending
            }
          >
            {recordReading.isPending ? 'Saving…' : 'Save reading'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Room" htmlFor="reading-room">
            <Select
              id="reading-room"
              value={form.roomId}
              onChange={(event) => setForm({ ...form, roomId: event.target.value })}
            >
              <option value="">Select a room</option>
              {(rooms.data ?? []).map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.number} — {room.occupiedBeds} resident
                  {room.occupiedBeds === 1 ? '' : 's'}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Period" htmlFor="reading-period">
          <Select
            id="reading-period"
            value={form.periodKey}
            onChange={(event) => setForm({ ...form, periodKey: event.target.value })}
          >
            {recentPeriods().map((period) => (
              <option key={period} value={period}>
                {formatPeriod(period)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reading date" htmlFor="reading-date">
          <Input
            id="reading-date"
            type="date"
            value={form.readingDate}
            onChange={(event) => setForm({ ...form, readingDate: event.target.value })}
          />
        </Field>

        <Field
          label="Previous reading"
          htmlFor="reading-previous"
          hint="Pre-filled from the last reading for this room."
        >
          <Input
            id="reading-previous"
            type="number"
            min={0}
            value={form.previous}
            onChange={(event) => setForm({ ...form, previous: event.target.value })}
          />
        </Field>

        <Field
          label="Current reading"
          htmlFor="reading-current"
          error={backwards ? 'Lower than the previous reading — check the meter.' : undefined}
        >
          <Input
            id="reading-current"
            type="number"
            min={0}
            value={form.current}
            onChange={(event) => setForm({ ...form, current: event.target.value })}
          />
        </Field>

        {/* Live preview so the owner catches a typo before saving, not after. */}
        {units > 0 && (
          <div className="rounded-md bg-[var(--color-surface-subtle)] px-3 py-2 text-sm sm:col-span-2">
            <span className="text-[var(--color-text-secondary)]">
              {units} units × {formatINR(rate)} ={' '}
            </span>
            <span className="font-semibold text-[var(--color-text-primary)]">
              {formatINR(preview, { withPaise: false })}
            </span>
            <span className="text-[var(--color-text-muted)]">
              {' '}
              — split between the room&apos;s residents by days occupied.
            </span>
          </div>
        )}

        <p className="text-xs text-[var(--color-text-muted)] sm:col-span-2">
          Entering a reading for a month that already has one records a correction; the original is
          kept.
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
