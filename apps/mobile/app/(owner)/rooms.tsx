import { formatINR } from '@heaven/money';
import { StyleSheet, Text, View } from 'react-native';

import { useOwnerOccupancy } from '../../src/api/owner';
import {
  Badge,
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

function bedTone(status: string): 'success' | 'info' | 'warning' {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'OCCUPIED') return 'info';
  return 'warning';
}

/** The building, floor by floor: who is where and which beds are free. */
export default function OwnerRoomsScreen() {
  const theme = useTheme();
  const occupancy = useOwnerOccupancy();

  if (occupancy.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading occupancy…" />
      </Screen>
    );
  }

  if (occupancy.error) {
    return (
      <Screen>
        <ErrorState
          message={
            occupancy.error instanceof ApiRequestError
              ? occupancy.error.message
              : 'Please try again.'
          }
          onRetry={() => void occupancy.refetch()}
        />
      </Screen>
    );
  }

  const { totals, floors, upcomingVacancies } = occupancy.data;

  return (
    <Screen onRefresh={() => void occupancy.refetch()} refreshing={occupancy.isRefetching}>
      <PageHeading
        title="Rooms and beds"
        subtitle={`${totals.occupied} of ${totals.beds} beds occupied · ${totals.occupancyRate}%`}
      />

      <Card>
        <View style={styles.summary}>
          <Metric label="Rooms" value={String(totals.rooms)} color={theme.textPrimary} />
          <Metric label="Occupied" value={String(totals.occupied)} color={theme.info} />
          <Metric
            label="Free"
            value={String(totals.available)}
            color={totals.available > 0 ? theme.success : theme.textMuted}
          />
          <Metric
            label="Blocked"
            value={String(totals.unavailable)}
            color={totals.unavailable > 0 ? theme.warning : theme.textMuted}
          />
        </View>
      </Card>

      {upcomingVacancies.length > 0 && (
        <Card>
          <CardTitle>Freeing up soon</CardTitle>
          {upcomingVacancies.map((vacancy) => (
            <View key={vacancy.tenancyId} style={styles.vacancyRow}>
              <View style={styles.grow}>
                <Text style={[styles.name, { color: theme.textPrimary }]}>
                  {vacancy.residentName}
                </Text>
                <Muted>
                  Room {vacancy.roomNumber} · bed {vacancy.bedLabel} · {vacancy.expectedExitDate}
                </Muted>
              </View>
              <Badge label={`${vacancy.daysRemaining}d`} tone="warning" />
            </View>
          ))}
        </Card>
      )}

      {floors.length === 0 ? (
        <Card>
          <EmptyState message="No floors or rooms have been set up yet." />
        </Card>
      ) : (
        floors.map((floor) => (
          <Card key={floor.id}>
            <CardTitle>{floor.name}</CardTitle>

            {floor.rooms.length === 0 ? (
              <Muted>No rooms on this floor.</Muted>
            ) : (
              floor.rooms.map((room) => (
                <View key={room.id} style={[styles.room, { borderColor: theme.border }]}>
                  <View style={styles.roomHeader}>
                    <Text style={[styles.roomNumber, { color: theme.textPrimary }]}>
                      Room {room.number}
                    </Text>
                    <Text style={[styles.roomMeta, { color: theme.textMuted }]}>
                      {room.roomType} · {room.isAirConditioned ? 'AC' : 'Non-AC'} ·{' '}
                      {formatINR(room.monthlyRentPaise, { withPaise: false })}
                    </Text>
                  </View>

                  {room.beds.map((bed) => (
                    <View key={bed.id} style={styles.bedRow}>
                      <Text style={[styles.bedLabel, { color: theme.textSecondary }]}>
                        Bed {bed.label}
                      </Text>
                      {bed.occupant === null ? (
                        <Badge label={bed.status} tone={bedTone(bed.status)} />
                      ) : (
                        <Text style={[styles.occupant, { color: theme.textPrimary }]}>
                          {bed.occupant.residentName}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ))
            )}
          </Card>
        ))
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
    <View style={styles.grow}>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: layout.spacing[3] },
  grow: { flex: 1, gap: layout.spacing[1] },
  metricLabel: { fontSize: layout.fontSize.xs },
  metricValue: {
    fontSize: layout.fontSize.xl,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  room: {
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    padding: layout.spacing[4],
    gap: layout.spacing[2],
  },
  roomHeader: { gap: layout.spacing[1] },
  roomNumber: { fontSize: layout.fontSize.md, fontWeight: '600' },
  roomMeta: { fontSize: layout.fontSize.xs },
  bedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bedLabel: { fontSize: layout.fontSize.sm },
  occupant: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  vacancyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacing[3],
    paddingVertical: layout.spacing[2],
  },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
