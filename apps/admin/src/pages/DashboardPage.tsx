import { MEAL_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { Link } from 'react-router-dom';

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,
  formatDate,
  formatPeriod,
  invoiceTone,
} from '../components/ui';
import { useDashboard } from '../lib/ownerApi';

/**
 * The owner's landing screen.
 *
 * Ordered by what needs a decision today: money owed first, then the kitchen's
 * numbers, then occupancy, then what changed. Every figure comes from the
 * database — none of this is decorative.
 */
export function DashboardPage() {
  const { data, error, isPending, refetch } = useDashboard();

  if (isPending) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <LoadingRows rows={8} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </Card>
      </>
    );
  }

  const { occupancy, money, meals, unpaidResidents, upcomingVacancies, recentActivity } = data;
  const collectionRate =
    money.expectedPaise === 0 ? 0 : Math.round((money.collectedPaise / money.expectedPaise) * 100);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${formatPeriod(money.periodKey)} · ${occupancy.totalResidents} residents`}
      />

      {/* Money first: it is the thing an owner opens the app to check. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Expected this month"
          value={formatINR(money.expectedPaise, { withPaise: false })}
        />
        <StatTile
          label="Collected"
          value={formatINR(money.collectedPaise, { withPaise: false })}
          hint={`${collectionRate}% of expected`}
          tone="success"
        />
        <StatTile
          label="Pending"
          value={formatINR(money.pendingPaise, { withPaise: false })}
          tone={money.pendingPaise > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Overdue invoices"
          value={String(money.overdueInvoiceCount)}
          tone={money.overdueInvoiceCount > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Rooms" value={String(occupancy.totalRooms)} />
        <StatTile label="Beds" value={String(occupancy.totalBeds)} />
        <StatTile label="Occupied" value={String(occupancy.occupiedBeds)} tone="info" />
        <StatTile
          label="Available"
          value={String(occupancy.availableBeds)}
          tone={occupancy.availableBeds > 0 ? 'success' : 'neutral'}
        />
        <StatTile
          label="Open complaints"
          value={String(data.openComplaints)}
          tone={data.openComplaints > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Residents with rent due"
          actions={
            <Link to="/billing" className="text-xs font-medium text-[var(--color-primary)]">
              All invoices
            </Link>
          }
        >
          {unpaidResidents.length === 0 ? (
            <EmptyState
              title="Everyone has paid"
              description="No outstanding rent for this month."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Resident</Th>
                  <Th>Room</Th>
                  <Th>Due</Th>
                  <Th align="right">Outstanding</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {unpaidResidents.slice(0, 8).map((resident) => (
                  <tr key={resident.tenancyId}>
                    <Td>
                      <Link
                        to={`/residents/${resident.tenancyId}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {resident.residentName}
                      </Link>
                    </Td>
                    <Td>{resident.roomNumber ?? '—'}</Td>
                    <Td>{formatDate(resident.dueDate)}</Td>
                    <Td align="right" className="tabular">
                      {formatINR(resident.outstandingPaise, { withPaise: false })}
                    </Td>
                    <Td>
                      <Badge label={resident.status} tone={invoiceTone(resident.status)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title={`Meals to prepare — ${formatDate(meals.date)}`}>
            <div className="grid grid-cols-3 gap-3">
              {meals.counts.map((count) => (
                <div key={count.mealType} className="text-center">
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {MEAL_LABELS[count.mealType]}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular text-[var(--color-text-primary)]">
                    {count.expected}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {count.absent === 0 ? 'no absences' : `${count.absent} away`}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-text-muted)]">
              Counted from {meals.totalActiveResidents} active residents, minus declared absences.
            </p>
          </Card>

          <Card
            title="Beds becoming available"
            actions={
              <Link to="/occupancy" className="text-xs font-medium text-[var(--color-primary)]">
                Occupancy
              </Link>
            }
          >
            {upcomingVacancies.length === 0 ? (
              <EmptyState
                title="No notice periods"
                description="Nobody has given notice for the next 60 days."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Resident</Th>
                    <Th>Bed</Th>
                    <Th>Leaves</Th>
                    <Th align="right">In</Th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingVacancies.slice(0, 5).map((vacancy) => (
                    <tr key={`${vacancy.roomNumber}-${vacancy.bedLabel}`}>
                      <Td>{vacancy.residentName}</Td>
                      <Td>
                        {vacancy.roomNumber} · {vacancy.bedLabel}
                      </Td>
                      <Td>{formatDate(vacancy.expectedExitDate)}</Td>
                      <Td align="right" className="tabular">
                        {vacancy.daysRemaining}d
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card title="Recent activity">
          {recentActivity.length === 0 ? (
            <EmptyState title="Nothing yet" description="Activity will appear here as you work." />
          ) : (
            <ul className="flex flex-col">
              {recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border)] py-2 last:border-b-0"
                >
                  <span className="text-sm text-[var(--color-text-primary)]">{entry.summary}</span>
                  <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                    {entry.actorName ?? 'System'} · {formatDate(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
