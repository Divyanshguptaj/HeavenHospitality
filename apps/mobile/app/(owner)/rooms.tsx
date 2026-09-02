import { formatINR } from '@heaven/money';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCreateFloor, useCreateRoom, useOwnerOccupancy } from '../../src/api/owner';
import {
  Badge,
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

function bedTone(status: string): 'success' | 'info' | 'warning' {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'OCCUPIED') return 'info';
  return 'warning';
}

/**
 * The building, floor by floor: who is where, which beds are free, and the
 * two things an owner sets up once — floors and rooms. Tap a room to add or
 * remove a resident.
 */
export default function OwnerRoomsScreen() {
  const theme = useTheme();
  const occupancy = useOwnerOccupancy();

  const [addingFloor, setAddingFloor] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);

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
        <View style={styles.actionsRow}>
          <Button label="Add floor" variant="secondary" onPress={() => setAddingFloor(true)} />
          <Button
            label="Add room"
            variant="secondary"
            onPress={() => {
              if (floors.length === 0) {
                Alert.alert('Add a floor first', 'A room needs a floor to belong to.');
                return;
              }
              setAddingRoom(true);
            }}
          />
        </View>
      </Card>

      {addingFloor && <AddFloorCard onDone={() => setAddingFloor(false)} />}
      {addingRoom && (
        <AddRoomCard
          floors={floors.map((floor) => ({ id: floor.id, name: floor.name }))}
          onDone={() => setAddingRoom(false)}
        />
      )}

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
                <Link
                  key={room.id}
                  href={{ pathname: '/(owner)/room/[id]', params: { id: room.id } }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Manage room ${room.number}`}
                    style={[styles.room, { borderColor: theme.border }]}
                  >
                    <View style={styles.roomHeader}>
                      <Text style={[styles.roomNumber, { color: theme.primary }]}>
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
                  </Pressable>
                </Link>
              ))
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

function AddFloorCard({ onDone }: { readonly onDone: () => void }) {
  const createFloor = useCreateFloor();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('0');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (name.trim() === '') {
      setError('Enter a name for the floor.');
      return;
    }
    setError(null);
    try {
      await createFloor.mutateAsync({ name: name.trim(), level: Number(level) });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the floor.');
    }
  }

  return (
    <Card>
      <CardTitle>Add floor</CardTitle>
      <FormField label="Name" value={name} onChangeText={setName} placeholder="First Floor" autoFocus />
      <FormField
        label="Level"
        value={level}
        onChangeText={setLevel}
        placeholder="0"
        keyboardType="number-pad"
      />
      {error !== null && <Muted>{error}</Muted>}
      <View style={styles.actionsRow}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        <Button
          label={createFloor.isPending ? 'Saving…' : 'Add floor'}
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

function AddRoomCard({
  floors,
  onDone,
}: {
  readonly floors: ReadonlyArray<{ id: string; name: string }>;
  readonly onDone: () => void;
}) {
  const createRoom = useCreateRoom();
  const theme = useTheme();

  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const [number, setNumber] = useState('');
  const [roomType, setRoomType] = useState('3 Sharing');
  const [capacity, setCapacity] = useState('3');
  const [rent, setRent] = useState('7000');
  const [isAirConditioned, setIsAirConditioned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (number.trim() === '' || floorId === '') {
      setError('Choose a floor and enter a room number.');
      return;
    }
    setError(null);
    try {
      await createRoom.mutateAsync({
        floorId,
        number: number.trim(),
        roomType: roomType.trim(),
        capacity: Number(capacity),
        monthlyRentPaise: Math.round(Number(rent) * 100),
        isAirConditioned,
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the room.');
    }
  }

  return (
    <Card>
      <CardTitle>Add room</CardTitle>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Floor</Text>
        <View style={styles.chipsRow}>
          {floors.map((floor) => {
            const active = floor.id === floorId;
            return (
              <Pressable
                key={floor.id}
                onPress={() => setFloorId(floor.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surfaceSubtle }]}
              >
                <Text style={{ color: active ? theme.textInverse : theme.textSecondary, fontWeight: '600' }}>
                  {floor.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField label="Room number" value={number} onChangeText={setNumber} placeholder="204" autoFocus />
      <FormField label="Room type" value={roomType} onChangeText={setRoomType} placeholder="3 Sharing" />
      <FormField
        label="Capacity"
        value={capacity}
        onChangeText={setCapacity}
        placeholder="3"
        keyboardType="number-pad"
      />
      <FormField
        label="Rent per resident (₹/month)"
        value={rent}
        onChangeText={setRent}
        placeholder="7000"
        keyboardType="decimal-pad"
      />

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Air conditioned</Text>
        <View style={styles.chipsRow}>
          {[
            { value: false, label: 'No' },
            { value: true, label: 'Yes' },
          ].map((option) => {
            const active = option.value === isAirConditioned;
            return (
              <Pressable
                key={option.label}
                onPress={() => setIsAirConditioned(option.value)}
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

      {error !== null && <Muted>{error}</Muted>}
      <View style={styles.actionsRow}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        <Button
          label={createRoom.isPending ? 'Saving…' : 'Add room'}
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  readonly autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={[
          styles.input,
          { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
        ]}
      />
    </View>
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
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2], marginTop: layout.spacing[3] },
  grow: { flex: 1, gap: layout.spacing[1] },
  metricLabel: { fontSize: layout.fontSize.xs },
  metricValue: {
    fontSize: layout.fontSize.xl,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  chip: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[2],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
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
