import type { RoomTypeView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useCreateRoomType,
  useDeleteRoomType,
  useRoomTypes,
  useUpdateRoomType,
} from '../../../src/api/owner';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiRequestError ? caught.message : fallback;
}

/**
 * The kinds of room this property offers: how many share, AC or not, and the rent
 * per person. Rooms are added by choosing one of these.
 */
export default function RoomTypesScreen() {
  const types = useRoomTypes(true);
  const [adding, setAdding] = useState(false);

  return (
    <Screen onRefresh={() => void types.refetch()} refreshing={types.isRefetching}>
      <PageHeading
        title="Room types"
        subtitle="Set the sharing, AC and rent once. Rooms are added by choosing one."
      />

      {adding ? (
        <AddRoomTypeCard onDone={() => setAdding(false)} />
      ) : (
        <Button label="Add room type" onPress={() => setAdding(true)} />
      )}

      {types.isPending ? (
        <LoadingState />
      ) : types.data === undefined ? (
        <ErrorState message={messageOf(types.error, 'Please try again.')} onRetry={() => void types.refetch()} />
      ) : types.data.length === 0 ? (
        <EmptyState message="No room types yet. Add the first one above." />
      ) : (
        <Card>
          {types.data.map((type, index) => (
            <View key={type.id}>
              {index > 0 && <Divider />}
              <RoomTypeRow type={type} />
            </View>
          ))}
        </Card>
      )}

      <Muted>
        A new rent applies to every room of that type from the next bill. Bills already issued
        keep their amount.
      </Muted>
    </Screen>
  );
}

function ChoiceRow<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surfaceSubtle }]}
            >
              <Text style={{ color: active ? theme.textInverse : theme.textSecondary, fontWeight: '600' }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const SHARING_OPTIONS = [1, 2, 3, 4, 5, 6].map((count) => ({ value: count, label: `${count}` }));
const AC_OPTIONS = [
  { value: true, label: 'AC' },
  { value: false, label: 'Non-AC' },
];

function AddRoomTypeCard({ onDone }: { readonly onDone: () => void }) {
  const create = useCreateRoomType();
  const [capacity, setCapacity] = useState(3);
  const [isAirConditioned, setIsAirConditioned] = useState(true);
  const [rent, setRent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const monthlyRentPaise = Math.round(Number(rent) * 100);
    if (!Number.isFinite(monthlyRentPaise) || monthlyRentPaise <= 0) {
      setError('Enter the rent per person, more than 0.');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ capacity, isAirConditioned, monthlyRentPaise });
      onDone();
    } catch (caught) {
      setError(messageOf(caught, 'Could not add the room type.'));
    }
  }

  return (
    <Card>
      <CardTitle>New room type</CardTitle>
      <ChoiceRow label="How many share" value={capacity} options={SHARING_OPTIONS} onChange={setCapacity} />
      <ChoiceRow label="Air conditioned" value={isAirConditioned} options={AC_OPTIONS} onChange={setIsAirConditioned} />
      <FormField
        label="Rent per person (₹/month)"
        value={rent}
        onChangeText={setRent}
        placeholder="11500"
        keyboardType="decimal-pad"
      />
      {error !== null && <Muted>{error}</Muted>}
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        <Button label={create.isPending ? 'Saving…' : 'Add'} onPress={() => void submit()} />
      </View>
    </Card>
  );
}

function RoomTypeRow({ type }: { readonly type: RoomTypeView }) {
  const update = useUpdateRoomType();
  const remove = useDeleteRoomType();
  const [editing, setEditing] = useState(false);
  const [rent, setRent] = useState(String(type.monthlyRentPaise / 100));
  const [capacity, setCapacity] = useState(type.capacity);
  const [isAirConditioned, setIsAirConditioned] = useState(type.isAirConditioned);
  const [error, setError] = useState<string | null>(null);

  const inUse = type.roomCount > 0;

  async function save(): Promise<void> {
    const monthlyRentPaise = Math.round(Number(rent) * 100);
    if (!Number.isFinite(monthlyRentPaise) || monthlyRentPaise <= 0) {
      setError('Enter the rent per person, more than 0.');
      return;
    }
    setError(null);

    const apply = async (): Promise<void> => {
      try {
        await update.mutateAsync({
          id: type.id,
          monthlyRentPaise,
          ...(inUse ? {} : { capacity, isAirConditioned }),
        });
        setEditing(false);
      } catch (caught) {
        setError(messageOf(caught, 'Could not save.'));
      }
    };

    if (monthlyRentPaise !== type.monthlyRentPaise && inUse) {
      Alert.alert(
        'Change the rent?',
        `${type.name} rooms (${type.roomCount}) will charge ${formatINR(monthlyRentPaise, { withPaise: false })} from the next bill. Bills already issued do not change.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change rent', onPress: () => void apply() },
        ],
      );
      return;
    }
    await apply();
  }

  function toggleActive(): void {
    void update.mutateAsync({ id: type.id, isActive: !type.isActive }).catch((caught: unknown) => {
      Alert.alert('Could not change', messageOf(caught, 'Please try again.'));
    });
  }

  function confirmDelete(): void {
    Alert.alert('Delete this room type?', `${type.name} · ${rupees(type.monthlyRentPaise)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void remove.mutateAsync(type.id).catch((caught: unknown) => {
            Alert.alert('Could not delete', messageOf(caught, 'Please try again.'));
          }),
      },
    ]);
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={styles.rowMain}>
          <Text style={styles.name}>{type.name}</Text>
          <Muted>{`${rupees(type.monthlyRentPaise)} per person · ${type.roomCount} room(s)`}</Muted>
        </View>
        {!type.isActive && <Badge label="Off" tone="neutral" />}
      </View>

      {editing ? (
        <View style={styles.field}>
          {inUse ? (
            <Muted>Sharing and AC are fixed while rooms use this type.</Muted>
          ) : (
            <>
              <ChoiceRow label="How many share" value={capacity} options={SHARING_OPTIONS} onChange={setCapacity} />
              <ChoiceRow label="Air conditioned" value={isAirConditioned} options={AC_OPTIONS} onChange={setIsAirConditioned} />
            </>
          )}
          <FormField
            label="Rent per person (₹/month)"
            value={rent}
            onChangeText={setRent}
            keyboardType="decimal-pad"
          />
          {error !== null && <Muted>{error}</Muted>}
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setEditing(false);
                setError(null);
              }}
            />
            <Button label={update.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />
          <Button label={type.isActive ? 'Switch off' : 'Switch on'} variant="secondary" onPress={toggleActive} />
          {!inUse && <Button label="Delete" variant="secondary" onPress={confirmDelete} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: layout.spacing[3], paddingVertical: layout.spacing[3] },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[3] },
  rowMain: { flex: 1, gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  chip: {
    minHeight: layout.minTouchTarget,
    minWidth: layout.minTouchTarget,
    borderRadius: layout.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.spacing[4],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
});
