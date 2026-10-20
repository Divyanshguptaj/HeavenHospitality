import type { RoomTypeView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useRoomTypes } from '../api/owner';
import { ErrorState, LoadingState, Muted } from './ui';
import { ApiRequestError } from '../lib/apiClient';
import { layout, useTheme } from '../theme';

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

/** The words a search can match: sharing, AC or not, and the rent in rupees. */
function searchWords(type: RoomTypeView): string[] {
  return [
    String(type.capacity),
    'sharing',
    type.isAirConditioned ? 'ac' : 'non-ac',
    ...(type.isAirConditioned ? [] : ['non']),
    String(type.monthlyRentPaise / 100),
  ];
}

export function matchesSearch(type: RoomTypeView, query: string): boolean {
  const words = searchWords(type);
  return query
    .toLowerCase()
    .replace(/[₹,]/g, '')
    .split(/\s+/)
    .filter((token) => token !== '')
    .every((token) => words.some((word) => word.startsWith(token)));
}

/** A search box over the saved room types; tapping one chooses it. */
export function RoomTypePicker({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (roomTypeId: string) => void;
}) {
  const theme = useTheme();
  const types = useRoomTypes();
  const [query, setQuery] = useState('');

  if (types.isPending) return <LoadingState />;
  if (types.data === undefined) {
    return (
      <ErrorState
        message={types.error instanceof ApiRequestError ? types.error.message : 'Please try again.'}
        onRetry={() => void types.refetch()}
      />
    );
  }

  const chosen = types.data.find((type) => type.id === value);
  const results = types.data.filter((type) => matchesSearch(type, query));

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Room type</Text>
      {chosen !== undefined && (
        <View style={[styles.chosen, { backgroundColor: theme.surfaceSubtle, borderColor: theme.primary }]}>
          <Text style={[styles.name, { color: theme.textPrimary }]}>{chosen.name}</Text>
          <Muted>{`${rupees(chosen.monthlyRentPaise)} per person each month · ${chosen.capacity} bed(s)`}</Muted>
        </View>
      )}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search: 3 sharing, AC, 11500…"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        accessibilityLabel="Search room types"
        style={[
          styles.search,
          { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
        ]}
      />
      {types.data.length === 0 ? (
        <Muted>No room types yet. Add them under More → Room types.</Muted>
      ) : results.length === 0 ? (
        <Muted>No room type matches that search.</Muted>
      ) : (
        results.map((type) => {
          const active = type.id === value;
          return (
            <Pressable
              key={type.id}
              onPress={() => onChange(type.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.row, { borderColor: active ? theme.primary : theme.border }]}
            >
              <Text style={[styles.name, { color: theme.textPrimary }]}>{type.name}</Text>
              <Text style={[styles.price, { color: theme.textSecondary }]}>
                {rupees(type.monthlyRentPaise)}
              </Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  chosen: {
    borderWidth: 2,
    borderRadius: layout.radius.lg,
    padding: layout.spacing[4],
    gap: layout.spacing[1],
  },
  search: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    minHeight: layout.minTouchTarget,
  },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
  price: { fontSize: layout.fontSize.md, fontVariant: ['tabular-nums'] },
});
