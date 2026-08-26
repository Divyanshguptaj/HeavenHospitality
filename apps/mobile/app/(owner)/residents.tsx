import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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

/** Everyone living here: where they are, what they owe. */
export default function OwnerResidentsScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const residents = useOwnerResidents(search === '' ? undefined : search);

  const rows = residents.data ?? [];
  const owing = rows.filter((resident) => resident.outstandingPaise > 0).length;
  const totalOwed = rows.reduce((sum, resident) => sum + resident.outstandingPaise, 0);

  return (
    <Screen onRefresh={() => void residents.refetch()} refreshing={residents.isRefetching}>
      <PageHeading title="Residents" subtitle={`${rows.length} active · ${owing} owe rent`} />

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
              search === ''
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
});
