import { MEAL_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useOwnerDashboard } from '../../src/api/owner';
import { useAuthStore } from '../../src/auth/authStore';
import {
  Badge,
  Body,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * The owner's overview.
 *
 * Ordered by what needs a decision today: money owed, then how many meals to
 * cook, then occupancy, then what is broken. Every figure is computed by the
 * server from live data.
 */
export default function OwnerOverviewScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const { data, error, isPending, refetch, isRefetching } = useOwnerDashboard();

  if (isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your property…" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <ErrorState
          message={error instanceof ApiRequestError ? error.message : 'Please try again.'}
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  const { occupancy, money, meals } = data;
  const collected =
    money.expectedPaise === 0 ? 0 : Math.round((money.collectedPaise / money.expectedPaise) * 100);

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <PageHeading
        title={user?.memberships[0]?.propertyName ?? 'Your property'}
        subtitle={`${money.periodKey} · ${occupancy.totalResidents} residents`}
      />

      {/* Money first — it is why an owner opens the app. */}
      <Card style={money.pendingPaise > 0 ? { borderColor: theme.warning } : undefined}>
        <View style={styles.row}>
          <CardTitle>This month</CardTitle>
          {money.overdueInvoiceCount > 0 && (
            <Badge label={`${money.overdueInvoiceCount} overdue`} tone="danger" />
          )}
        </View>

        <View style={styles.moneyRow}>
          <Metric
            label="Expected"
            value={formatINR(money.expectedPaise, { withPaise: false })}
            color={theme.textPrimary}
          />
          <Metric
            label="Collected"
            value={formatINR(money.collectedPaise, { withPaise: false })}
            color={theme.success}
          />
          <Metric
            label="Pending"
            value={formatINR(money.pendingPaise, { withPaise: false })}
            color={money.pendingPaise > 0 ? theme.danger : theme.textMuted}
          />
        </View>

        <Muted>{collected}% of this month&apos;s billing has been collected.</Muted>

        <Button label="Collect a payment" onPress={() => router.push('/(owner)/collect')} />
      </Card>

      <Card>
        <CardTitle>Meals to cook today</CardTitle>
        <View style={styles.moneyRow}>
          {meals.counts.map((count) => (
            <Metric
              key={count.mealType}
              label={MEAL_LABELS[count.mealType]}
              value={String(count.expected)}
              color={theme.textPrimary}
            />
          ))}
        </View>
        <Muted>
          From {meals.totalActiveResidents} residents, minus those who said they will be away.
        </Muted>
      </Card>

      <Card>
        <CardTitle>Occupancy</CardTitle>
        <View style={styles.moneyRow}>
          <Metric label="Beds" value={String(occupancy.totalBeds)} color={theme.textPrimary} />
          <Metric label="Occupied" value={String(occupancy.occupiedBeds)} color={theme.info} />
          <Metric
            label="Free"
            value={String(occupancy.availableBeds)}
            color={occupancy.availableBeds > 0 ? theme.success : theme.textMuted}
          />
        </View>
        <Button
          label="See rooms and beds"
          variant="secondary"
          onPress={() => router.push('/(owner)/rooms')}
        />
      </Card>

      <Card>
        <View style={styles.row}>
          <CardTitle>Residents who owe rent</CardTitle>
          <Badge
            label={String(data.unpaidResidents.length)}
            tone={data.unpaidResidents.length > 0 ? 'warning' : 'success'}
          />
        </View>

        {data.unpaidResidents.length === 0 ? (
          <EmptyState message="Everyone has paid this month." />
        ) : (
          data.unpaidResidents.slice(0, 6).map((resident) => (
            <View key={resident.tenancyId} style={styles.listRow}>
              <View style={styles.listMain}>
                <Text style={[styles.name, { color: theme.textPrimary }]}>
                  {resident.residentName}
                </Text>
                <Muted>
                  {resident.roomNumber === null ? 'No room' : `Room ${resident.roomNumber}`} · due{' '}
                  {resident.dueDate}
                </Muted>
              </View>
              <Text style={[styles.amount, { color: theme.danger }]}>
                {formatINR(resident.outstandingPaise, { withPaise: false })}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <View style={styles.row}>
          <CardTitle>Open complaints</CardTitle>
          <Badge
            label={String(data.openComplaints)}
            tone={data.openComplaints > 0 ? 'danger' : 'success'}
          />
        </View>
        <Button
          label="View issues"
          variant="secondary"
          onPress={() => router.push('/(owner)/issues')}
        />
      </Card>

      {data.upcomingVacancies.length > 0 && (
        <Card>
          <CardTitle>Beds freeing up</CardTitle>
          {data.upcomingVacancies.map((vacancy) => (
            <View key={`${vacancy.roomNumber}-${vacancy.bedLabel}`} style={styles.listRow}>
              <View style={styles.listMain}>
                <Text style={[styles.name, { color: theme.textPrimary }]}>
                  {vacancy.residentName}
                </Text>
                <Muted>
                  Room {vacancy.roomNumber} · bed {vacancy.bedLabel}
                </Muted>
              </View>
              <Text style={[styles.days, { color: theme.textSecondary }]}>
                {vacancy.daysRemaining}d
              </Text>
            </View>
          ))}
        </Card>
      )}

      {data.recentActivity.length > 0 && (
        <Card>
          <CardTitle>Recent activity</CardTitle>
          {data.recentActivity.slice(0, 6).map((entry) => (
            <View key={entry.id} style={styles.activity}>
              <Body>{entry.summary}</Body>
              <Muted>{entry.createdAt.slice(0, 10)}</Muted>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string;
  readonly color: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  moneyRow: { flexDirection: 'row', gap: layout.spacing[4] },
  metric: { flex: 1, gap: layout.spacing[1] },
  metricLabel: { fontSize: layout.fontSize.xs },
  metricValue: {
    fontSize: layout.fontSize.lg,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[2],
  },
  listMain: { flex: 1, gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
  amount: { fontSize: layout.fontSize.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
  days: { fontSize: layout.fontSize.md, fontVariant: ['tabular-nums'] },
  activity: { gap: layout.spacing[1], paddingVertical: layout.spacing[2] },
});
