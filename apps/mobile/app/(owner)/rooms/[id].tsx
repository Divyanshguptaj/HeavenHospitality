import type { RoomView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  lookupUserByPhone,
  useCreateResident,
  useDeleteRoom,
  useExitResident,
  useLastReading,
  useOwnerRoom,
  useOwnerSettings,
  useRecordReading,
  useUpdateRoom,
} from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DetailRow,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

function bedTone(status: string): 'success' | 'info' | 'warning' {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'OCCUPIED') return 'info';
  return 'warning';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriodKey(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * One room, from the phone: who is in which bed, and the two moves an owner
 * makes here — fill an empty bed with an existing account, or take someone
 * off one. Both go through accounts the app already knows about; filling a
 * bed searches by phone rather than creating a person on the spot, because a
 * resident's account is meant to come from their own signup. Removing one is
 * refused while rent is outstanding.
 */
export default function OwnerRoomDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const room = useOwnerRoom(id);
  const exitResident = useExitResident();
  const deleteRoom = useDeleteRoom();

  const [assigningBedId, setAssigningBedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [removingTenancyId, setRemovingTenancyId] = useState<string | null>(null);
  const [addingBill, setAddingBill] = useState(false);

  if (room.isPending) {
    return (
      <Screen center>
        <LoadingState label="Loading the room…" />
      </Screen>
    );
  }

  if (room.data === undefined) {
    // A background refetch (after a mutation, say) can fail while stale data
    // from before is still good to show — that case falls through below
    // instead of replacing a working screen with an error.
    return (
      <Screen center>
        <ErrorState
          message={room.error instanceof ApiRequestError ? room.error.message : 'Please try again.'}
          onRetry={() => void room.refetch()}
        />
      </Screen>
    );
  }

  const data = room.data;

  function removeRoom(): void {
    Alert.alert(
      `Delete room ${data.number}?`,
      'This removes the room and its beds. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteRoom.mutateAsync(data.id).then(
              () => router.back(),
              (error: unknown) => {
                Alert.alert(
                  'Could not delete',
                  error instanceof ApiRequestError ? error.message : 'Please try again.',
                );
              },
            );
          },
        },
      ],
    );
  }

  function removeResident(
    tenancyId: string,
    bedLabel: string,
    residentName: string,
    outstandingPaise: number,
  ): void {
    if (removingTenancyId !== null) return;

    if (outstandingPaise > 0) {
      Alert.alert(
        'Rent is still owed',
        `${residentName} owes ${formatINR(outstandingPaise, { withPaise: false })}. Settle or waive it from Collect or their profile before removing them from the room.`,
      );
      return;
    }

    Alert.alert(
      `Remove ${residentName}?`,
      `Bed ${bedLabel} is released and their account reverts to a non-resident.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setRemovingTenancyId(tenancyId);
            exitResident
              .mutateAsync({ id: tenancyId, actualExitDate: today() })
              .catch((error: unknown) => {
                Alert.alert(
                  'Could not remove',
                  error instanceof ApiRequestError ? error.message : 'Please try again.',
                );
              })
              .finally(() => setRemovingTenancyId(null));
          },
        },
      ],
    );
  }

  return (
    <Screen onRefresh={() => void room.refetch()} refreshing={room.isRefetching}>
      <PageHeading
        title={`Room ${data.number}`}
        subtitle={`${data.floor.name} · ${data.roomType} · ${data.isAirConditioned ? 'AC' : 'Non-AC'} · ${formatINR(
          data.monthlyRentPaise,
          { withPaise: false },
        )}/mo`}
      />

      <Card>
        <View style={styles.cardHeaderRow}>
          <CardTitle>Room details</CardTitle>
          {!editing && (
            <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />
          )}
        </View>

        {editing ? (
          <EditRoomForm room={data} onDone={() => setEditing(false)} />
        ) : (
          <>
            <DetailRow label="Type" value={data.roomType} />
            <DetailRow label="Capacity" value={String(data.capacity)} />
            <DetailRow label="Rent" value={`${formatINR(data.monthlyRentPaise, { withPaise: false })}/mo`} />
            <DetailRow label="AC" value={data.isAirConditioned ? 'Yes' : 'No'} />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>{`${data.occupiedBeds} of ${data.beds.length} beds occupied`}</CardTitle>

        {data.beds.map((bed) => (
          <View key={bed.id} style={styles.bedBlock}>
            <View style={styles.bedHeader}>
              <Text style={[styles.bedLabel, { color: theme.textPrimary }]}>Bed {bed.label}</Text>
              <Badge label={bed.status} tone={bedTone(bed.status)} />
            </View>

            {bed.occupant !== null ? (
              <View style={styles.occupantRow}>
                <View style={styles.grow}>
                  <Text style={[styles.occupantName, { color: theme.textPrimary }]}>
                    {bed.occupant.residentName}
                  </Text>
                  {bed.occupant.outstandingPaise > 0 && (
                    <Text style={[styles.owed, { color: theme.danger }]}>
                      {formatINR(bed.occupant.outstandingPaise, { withPaise: false })} owed
                    </Text>
                  )}
                </View>
                <Button
                  label={removingTenancyId === bed.occupant.tenancyId ? 'Removing…' : 'Remove'}
                  variant="secondary"
                  onPress={() =>
                    removeResident(
                      bed.occupant?.tenancyId ?? '',
                      bed.label,
                      bed.occupant?.residentName ?? '',
                      bed.occupant?.outstandingPaise ?? 0,
                    )
                  }
                />
              </View>
            ) : bed.status === 'AVAILABLE' ? (
              assigningBedId === bed.id ? (
                <AssignForm
                  roomNumber={data.number}
                  bedId={bed.id}
                  bedLabel={bed.label}
                  onDone={() => setAssigningBedId(null)}
                />
              ) : (
                <Button label="Add resident" onPress={() => setAssigningBedId(bed.id)} />
              )
            ) : (
              <Muted>Not offerable while it is {bed.status.toLowerCase()}.</Muted>
            )}
          </View>
        ))}
      </Card>

      {data.isAirConditioned && (
        <Card>
          <View style={styles.cardHeaderRow}>
            <CardTitle>Electricity / AC bill</CardTitle>
            {!addingBill && data.occupiedBeds > 0 && (
              <Button label="Add bill" variant="secondary" onPress={() => setAddingBill(true)} />
            )}
          </View>

          {data.occupiedBeds === 0 ? (
            <Muted>No one is in this room yet — there is nobody to split a bill between.</Muted>
          ) : addingBill ? (
            <ElectricityBillForm
              roomId={data.id}
              occupiedBeds={data.occupiedBeds}
              onDone={() => setAddingBill(false)}
            />
          ) : (
            <Muted>
              Enter the meter reading; the amount is split between the {data.occupiedBeds} current
              resident{data.occupiedBeds === 1 ? '' : 's'} by how long each of them was here.
            </Muted>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>Delete room</CardTitle>
        {data.occupiedBeds > 0 ? (
          <Muted>Move every resident out of this room before deleting it.</Muted>
        ) : (
          <Button
            label={deleteRoom.isPending ? 'Deleting…' : 'Delete this room'}
            variant="secondary"
            onPress={removeRoom}
          />
        )}
      </Card>
    </Screen>
  );
}

/** Edits a room's number, type, capacity, rent and AC — everything set when it was added. */
function EditRoomForm({
  room,
  onDone,
}: {
  readonly room: RoomView;
  readonly onDone: () => void;
}) {
  const theme = useTheme();
  const updateRoom = useUpdateRoom();

  const [number, setNumber] = useState(room.number);
  const [roomType, setRoomType] = useState(room.roomType);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const [rent, setRent] = useState(String(room.monthlyRentPaise / 100));
  const [isAirConditioned, setIsAirConditioned] = useState(room.isAirConditioned);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (number.trim() === '') {
      setError('Enter a room number.');
      return;
    }
    setError(null);
    try {
      await updateRoom.mutateAsync({
        id: room.id,
        number: number.trim(),
        roomType: roomType.trim(),
        capacity: Number(capacity),
        monthlyRentPaise: Math.round(Number(rent) * 100),
        isAirConditioned,
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not update the room.');
    }
  }

  return (
    <View style={styles.form}>
      <FormField label="Room number" value={number} onChangeText={setNumber} placeholder="204" />
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
              <Button
                key={option.label}
                label={option.label}
                variant={active ? 'primary' : 'secondary'}
                onPress={() => setIsAirConditioned(option.value)}
              />
            );
          })}
        </View>
      </View>

      {error !== null && <Muted>{error}</Muted>}
      <View style={styles.searchRow}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        <Button
          label={updateRoom.isPending ? 'Saving…' : 'Save changes'}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

/** Fills one bed with an account that already exists, found by phone. */
function AssignForm({
  roomNumber,
  bedId,
  bedLabel,
  onDone,
}: {
  readonly roomNumber: string;
  readonly bedId: string;
  readonly bedLabel: string;
  readonly onDone: () => void;
}) {
  const theme = useTheme();
  const createResident = useCreateResident();

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    hasActiveTenancy: boolean;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function search(): Promise<void> {
    const value = phone.trim();
    if (value === '') return;

    setChecking(true);
    setError(null);
    setFound(null);
    setNotFound(false);
    try {
      const result = await lookupUserByPhone(value);
      if (result === null) setNotFound(true);
      else setFound(result);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not search.');
    } finally {
      setChecking(false);
    }
  }

  async function assign(): Promise<void> {
    if (found === null) return;
    setError(null);

    const depositValue = deposit.trim();
    const depositRupees = Number(depositValue);
    if (depositValue === '' || Number.isNaN(depositRupees) || depositRupees < 0) {
      setError('Enter a security deposit amount — 0 if there isn’t one.');
      return;
    }

    try {
      await createResident.mutateAsync({
        existingUserId: found.id,
        fullName: found.fullName,
        phone: found.phone ?? phone.trim(),
        ...(found.email === null ? {} : { email: found.email }),
        joiningDate: today(),
        bedId,
        securityDepositPaise: Math.round(depositRupees * 100),
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the resident.');
    }
  }

  return (
    <View style={styles.form}>
      <Text style={[styles.formTitle, { color: theme.textPrimary }]}>
        Add to room {roomNumber}, bed {bedLabel}
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setFound(null);
            setNotFound(false);
          }}
          placeholder="Resident's phone number"
          placeholderTextColor={theme.textMuted}
          keyboardType="phone-pad"
          accessibilityLabel="Resident's phone number"
          autoFocus
          style={[
            styles.input,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
          ]}
        />
        <Button label={checking ? 'Searching…' : 'Search'} variant="secondary" onPress={() => void search()} />
      </View>

      {notFound && (
        <Muted>No account with that number. They need to sign up in the app first.</Muted>
      )}

      {found !== null && (
        <Text style={[styles.owed, { color: found.hasActiveTenancy ? theme.danger : theme.success }]}>
          {found.hasActiveTenancy
            ? `${found.fullName} already has an active stay here.`
            : `Found ${found.fullName}.`}
        </Text>
      )}

      {found !== null && !found.hasActiveTenancy && (
        <FormField
          label="Security deposit (₹)"
          value={deposit}
          onChangeText={setDeposit}
          placeholder="Required — 0 if there isn't one"
          keyboardType="decimal-pad"
        />
      )}

      {error !== null && <Muted>{error}</Muted>}

      <View style={styles.searchRow}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        {found !== null && !found.hasActiveTenancy && (
          <Button
            label={createResident.isPending ? 'Adding…' : 'Add to this room'}
            onPress={() => void assign()}
          />
        )}
      </View>
    </View>
  );
}

/**
 * Records a meter reading for the room; the server turns it into an amount
 * (units × the property's electricity rate) and splits it across whoever
 * occupied the room during the period, weighted by how many days each of
 * them was actually here.
 */
function ElectricityBillForm({
  roomId,
  occupiedBeds,
  onDone,
}: {
  readonly roomId: string;
  readonly occupiedBeds: number;
  readonly onDone: () => void;
}) {
  const lastReading = useLastReading(roomId);
  const settings = useOwnerSettings();
  const recordReading = useRecordReading();

  const [previousReading, setPreviousReading] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [readingDate, setReadingDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lastReading.data !== undefined && lastReading.data !== null) {
      setPreviousReading(String(lastReading.data.currentReading));
    }
  }, [lastReading.data]);

  const previous = Number(previousReading);
  const current = Number(currentReading);
  const rate = settings.data?.financial.electricityRatePaisePerUnit;
  const canEstimate =
    previousReading.trim() !== '' &&
    currentReading.trim() !== '' &&
    !Number.isNaN(previous) &&
    !Number.isNaN(current) &&
    current >= previous &&
    rate !== undefined;
  const estimatedUnits = canEstimate ? current - previous : 0;
  const estimatedTotalPaise = canEstimate ? estimatedUnits * rate : 0;

  async function submit(): Promise<void> {
    setError(null);

    if (previousReading.trim() === '' || currentReading.trim() === '') {
      setError('Enter both the previous and current meter readings.');
      return;
    }
    if (Number.isNaN(previous) || Number.isNaN(current) || current < previous) {
      setError('The current reading must be a number at least as large as the previous one.');
      return;
    }

    try {
      await recordReading.mutateAsync({
        roomId,
        periodKey,
        previousReading: previous,
        currentReading: current,
        readingDate,
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not record the reading.');
    }
  }

  return (
    <View style={styles.form}>
      <FormField label="Billing period" value={periodKey} onChangeText={setPeriodKey} placeholder="YYYY-MM" />
      <FormField
        label="Previous reading (units)"
        value={previousReading}
        onChangeText={setPreviousReading}
        keyboardType="number-pad"
      />
      <FormField
        label="Current reading (units)"
        value={currentReading}
        onChangeText={setCurrentReading}
        keyboardType="number-pad"
        autoFocus
      />
      <DateField label="Reading date" value={readingDate} onChange={setReadingDate} />

      {canEstimate && (
        <Muted>
          {estimatedUnits} units · {formatINR(estimatedTotalPaise, { withPaise: false })} total · ≈
          {formatINR(Math.round(estimatedTotalPaise / occupiedBeds), { withPaise: false })} each across{' '}
          {occupiedBeds} resident{occupiedBeds === 1 ? '' : 's'} (the actual split accounts for who
          joined or left mid-period)
        </Muted>
      )}

      {error !== null && <Muted>{error}</Muted>}

      <View style={styles.searchRow}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        <Button label={recordReading.isPending ? 'Saving…' : 'Save bill'} onPress={() => void submit()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  bedBlock: {
    gap: layout.spacing[2],
    paddingVertical: layout.spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bedLabel: { fontWeight: '600' },
  occupantRow: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[3] },
  grow: { flex: 1, gap: layout.spacing[1] },
  occupantName: { fontSize: layout.fontSize.md, fontWeight: '600' },
  owed: { fontSize: layout.fontSize.sm },
  form: { gap: layout.spacing[3], paddingTop: layout.spacing[2] },
  formTitle: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: layout.spacing[2], alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
});
