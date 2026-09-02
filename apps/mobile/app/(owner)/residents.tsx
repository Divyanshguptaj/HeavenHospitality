import { formatINR } from '@heaven/money';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOwnerResidents } from '../../src/api/owner';
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

/**
 * Everyone living here: where they are, what they owe.
 *
 * Opened from the dashboard's "Residents who owe rent" card with
 * `filter: 'owing'`, so that link lands pre-filtered rather than dumping the
 * whole roster.
 */
export default function OwnerResidentsScreen() {
  const theme = useTheme();
  const { filter: initialFilter } = useLocalSearchParams<{ filter?: string }>();
  const [search, setSearch] = useState('');
  const [owingOnly, setOwingOnly] = useState(initialFilter === 'owing');
  const residents = useOwnerResidents(search === '' ? undefined : search);

  const allRows = residents.data ?? [];
  const owing = allRows.filter((resident) => resident.outstandingPaise > 0).length;
  const totalOwed = allRows.reduce((sum, resident) => sum + resident.outstandingPaise, 0);
  const rows = owingOnly ? allRows.filter((resident) => resident.outstandingPaise > 0) : allRows;

  return (
    <Screen onRefresh={() => void residents.refetch()} refreshing={residents.isRefetching}>
      <PageHeading title="Residents" subtitle={`${allRows.length} active · ${owing} owe rent`} />

      <Card>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or phone"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Search residents"
          autoCapitalize="none"
          style={[
            styles.search,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
          ]}
        />
        {totalOwed > 0 && (
          <Muted>
            {formatINR(totalOwed, { withPaise: false })} outstanding across all residents.
          </Muted>
        )}

        <View style={styles.filters}>
          {([
            { key: false, label: 'All' },
            { key: true, label: 'Owe rent' },
          ] as const).map((option) => {
            const active = owingOnly === option.key;
            return (
              <Pressable
                key={option.label}
                onPress={() => setOwingOnly(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filter,
                  { backgroundColor: active ? theme.primary : theme.surfaceSubtle },
                ]}
              >
                <Text
                  style={{
                    color: active ? theme.textInverse : theme.textSecondary,
                    fontSize: layout.fontSize.sm,
                    fontWeight: '600',
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {residents.isPending ? (
        <LoadingState />
      ) : residents.error ? (
        <ErrorState
          message={
            residents.error instanceof ApiRequestError
              ? residents.error.message
              : 'Please try again.'
          }
          onRetry={() => void residents.refetch()}
        />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            message={
              owingOnly
                ? 'Everyone has paid this month.'
                : search === ''
                  ? 'No residents yet. Add them from the admin console on a computer.'
                  : 'Nobody matches that search.'
            }
          />
        </Card>
      ) : (
        rows.map((resident) => (
          <Card key={resident.tenancyId}>
            <View style={styles.headerRow}>
              <CardTitle>{resident.fullName}</CardTitle>
              <Badge
                label={
                  resident.outstandingPaise > 0
                    ? formatINR(resident.outstandingPaise, { withPaise: false })
                    : 'Paid up'
                }
                tone={resident.outstandingPaise > 0 ? 'danger' : 'success'}
              />
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Room</Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                {resident.bed === null
                  ? 'Not allocated'
                  : `${resident.bed.roomNumber} · bed ${resident.bed.bedLabel} (${resident.bed.floorName})`}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Rent</Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                {formatINR(resident.monthlyRentPaise, { withPaise: false })}/month
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Joined</Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                {resident.joiningDate}
              </Text>
            </View>

            {resident.expectedExitDate !== null && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Leaving</Text>
                <Text style={[styles.detailValue, { color: theme.warning }]}>
                  {resident.expectedExitDate}
                </Text>
              </View>
            )}

            <Muted>{resident.email ?? resident.phone ?? 'No contact details'}</Muted>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[3],
  },
  detailRow: { flexDirection: 'row', gap: layout.spacing[4] },
  detailLabel: { width: 64, fontSize: layout.fontSize.sm },
  detailValue: { flex: 1, fontSize: layout.fontSize.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  filter: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[5],
    paddingVertical: layout.spacing[3],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
});
