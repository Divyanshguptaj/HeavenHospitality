import { formatINR } from '@heaven/money';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ResidentSummaryView } from '@heaven/contracts';

import { useOwnerResidents } from '../../../src/api/owner';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

const PAGE_SIZE = 10;

/**
 * Everyone living here: where they are, what they owe.
 *
 * Opened from the dashboard's "Residents who owe rent" card with
 * `filter: 'owing'`, so that link lands pre-filtered rather than dumping the
 * whole roster. The list itself reveals ten at a time as the owner scrolls,
 * rather than rendering a potentially long roster all at once.
 */
export default function OwnerResidentsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { filter: initialFilter } = useLocalSearchParams<{ filter?: string }>();
  const [search, setSearch] = useState('');
  const [owingOnly, setOwingOnly] = useState(initialFilter === 'owing');
  const [floorFilter, setFloorFilter] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const residents = useOwnerResidents(search === '' ? undefined : search);

  const allRows = residents.data ?? [];
  const owing = allRows.filter((resident) => resident.outstandingPaise > 0).length;
  const totalOwed = allRows.reduce((sum, resident) => sum + resident.outstandingPaise, 0);

  // Room options narrow to whichever floor is picked, so choosing a floor
  // never leaves a stale room selected that no longer belongs to it.
  const floorOptions = Array.from(
    new Set(allRows.flatMap((resident) => (resident.bed === null ? [] : [resident.bed.floorName]))),
  ).sort();
  const roomOptions = Array.from(
    new Set(
      allRows.flatMap((resident) =>
        resident.bed === null || (floorFilter !== null && resident.bed.floorName !== floorFilter)
          ? []
          : [resident.bed.roomNumber],
      ),
    ),
  ).sort();

  const rows = allRows
    .filter((resident) => !owingOnly || resident.outstandingPaise > 0)
    .filter((resident) => floorFilter === null || resident.bed?.floorName === floorFilter)
    .filter((resident) => roomFilter === null || resident.bed?.roomNumber === roomFilter);
  const visibleRows = rows.slice(0, visibleCount);

  // A narrower search or filter should show its own first page, not whatever
  // page the previous, larger list happened to be scrolled to.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, owingOnly, floorFilter, roomFilter]);

  function chooseFloor(floor: string | null): void {
    setFloorFilter(floor);
    // The previously chosen room may not exist on the new floor.
    setRoomFilter(null);
  }

  return (
    <FlatList
      data={visibleRows}
      keyExtractor={(resident) => resident.tenancyId}
      contentContainerStyle={[styles.screenContent, { paddingTop: insets.top + layout.spacing[5] }]}
      style={{ backgroundColor: theme.canvas }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={residents.isRefetching} onRefresh={() => void residents.refetch()} />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, rows.length))}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headingRow}>
            <View style={styles.grow}>
              <PageHeading title="Residents" subtitle={`${allRows.length} active · ${owing} owe rent`} />
            </View>
            <Button label="Add" onPress={() => router.push('/(owner)/residents/add')} />
          </View>

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

            {floorOptions.length > 0 && (
              <View style={styles.field}>
                <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Floor</Text>
                <View style={styles.filters}>
                  {[{ key: null, label: 'All floors' }, ...floorOptions.map((floor) => ({ key: floor, label: floor }))].map(
                    (option) => {
                      const active = floorFilter === option.key;
                      return (
                        <Pressable
                          key={option.label}
                          onPress={() => chooseFloor(option.key)}
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
                    },
                  )}
                </View>
              </View>
            )}

            {roomOptions.length > 0 && (
              <View style={styles.field}>
                <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Room</Text>
                <View style={styles.filters}>
                  {[{ key: null, label: 'All rooms' }, ...roomOptions.map((room) => ({ key: room, label: room }))].map(
                    (option) => {
                      const active = roomFilter === option.key;
                      return (
                        <Pressable
                          key={option.label}
                          onPress={() => setRoomFilter(option.key)}
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
                    },
                  )}
                </View>
              </View>
            )}
          </Card>

          {residents.isPending && <LoadingState />}
          {residents.error && (
            <ErrorState
              message={
                residents.error instanceof ApiRequestError
                  ? residents.error.message
                  : 'Please try again.'
              }
              onRetry={() => void residents.refetch()}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        residents.isPending || residents.error ? null : (
          <Card>
            <EmptyState
              message={
                floorFilter !== null || roomFilter !== null
                  ? 'Nobody matches these filters.'
                  : owingOnly
                    ? 'Everyone has paid this month.'
                    : search === ''
                      ? 'No residents yet. Tap Add to bring someone in.'
                      : 'Nobody matches that search.'
              }
            />
          </Card>
        )
      }
      renderItem={({ item: resident }) => <ResidentRow resident={resident} />}
      ListFooterComponent={
        visibleCount < rows.length ? <LoadingState label="Loading more…" /> : null
      }
    />
  );
}

function ResidentRow({ resident }: { readonly resident: ResidentSummaryView }) {
  const theme = useTheme();
  const owes = resident.outstandingPaise > 0;
  const details: ReadonlyArray<{ label: string; value: string; color?: string }> = [
    {
      label: 'Room',
      value:
        resident.bed === null
          ? 'Not allocated'
          : `${resident.bed.roomNumber} · bed ${resident.bed.bedLabel} (${resident.bed.floorName})`,
    },
    { label: 'Rent', value: `${formatINR(resident.monthlyRentPaise, { withPaise: false })}/month` },
    { label: 'Contact', value: resident.phone ?? resident.email ?? 'Not provided' },
    { label: 'Joined', value: resident.joiningDate },
    ...(resident.expectedExitDate === null
      ? []
      : [{ label: 'Leaving', value: resident.expectedExitDate, color: theme.warning }]),
  ];

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/(owner)/residents/[id]', params: { id: resident.tenancyId } })
      }
      accessibilityRole="button"
      accessibilityLabel={`${resident.fullName}. View details.`}
    >
      <Card>
        <View style={styles.cardRow}>
          {resident.photoUrl === null ? (
            <View style={[styles.photo, styles.photoEmpty, { backgroundColor: theme.primarySubtle }]}>
              <Text style={[styles.photoInitial, { color: theme.primary }]}>
                {resident.fullName.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <Image source={{ uri: resident.photoUrl }} style={styles.photo} resizeMode="cover" />
          )}

          <View style={styles.info}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.name, { color: theme.textPrimary }]}>
              {resident.fullName}
            </Text>
            <View style={styles.badgeRow}>
              <Badge
                label={owes ? formatINR(resident.outstandingPaise, { withPaise: false }) : 'Paid up'}
                tone={owes ? 'danger' : 'success'}
              />
            </View>

            {details.map((detail) => (
              <View key={detail.label} style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{detail.label}</Text>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.detailValue, { color: detail.color ?? theme.textPrimary }]}
                >
                  {detail.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: layout.spacing[5],
    gap: layout.spacing[3],
    paddingBottom: layout.spacing[10],
  },
  header: { gap: layout.spacing[5], marginBottom: layout.spacing[5] },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  grow: { flex: 1 },
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
  cardRow: { flexDirection: 'row', gap: layout.spacing[4] },
  photo: { width: 112, height: 150, borderRadius: layout.radius.lg },
  info: { flex: 1, gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.lg, fontWeight: '700' },
  badgeRow: { flexDirection: 'row' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: layout.fontSize.lg, fontWeight: '700' },
  detailRow: { flexDirection: 'row', gap: layout.spacing[4] },
  detailLabel: { width: 60, fontSize: layout.fontSize.sm },
  detailValue: { flex: 1, fontSize: layout.fontSize.sm },
  field: { gap: layout.spacing[2] },
  filterLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  filter: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[5],
    paddingVertical: layout.spacing[3],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
});
