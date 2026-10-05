import type { RoomView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  lookupUserByPhone,
  useCreateResident,
  useDeleteRoom,
  useExitResident,
  useMoveResident,
  useOwnerRoom,
  useRecordElectricityBill,
  useUpdateRoom,
} from '../../../src/api/owner';
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
            <Muted>No one is in this room yet — there is nobody to bill.</Muted>
          ) : addingBill ? (
            <ElectricityBillForm
              roomId={data.id}
              occupants={data.beds
                .map((bed) => bed.occupant)
                .filter((occupant): occupant is NonNullable<typeof occupant> => occupant !== null)}
              onDone={() => setAddingBill(false)}
            />
          ) : (
            <Muted>
              Enter what each current resident owes. This adds a new charge on top of anything
              already billed for the month — it does not replace it.
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
  const moveResident = useMoveResident();

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    activeTenancyId: string | null;
    hasBed: boolean;
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

  // Already a resident somewhere else in the building — a real conflict, the
  // only case this form still refuses.
  const blocked = found !== null && found.activeTenancyId !== null && found.hasBed;
  // Already a resident, but with no bed yet — exactly what an applicant just
  // promoted from Applicants looks like. This bed is placed with a move, not
  // a second tenancy, since one already exists.
  const awaitingBed = found !== null && found.activeTenancyId !== null && !found.hasBed;

  async function assign(): Promise<void> {
    if (found === null || blocked) return;
    setError(null);

    if (awaitingBed) {
      try {
        await moveResident.mutateAsync({ id: found.activeTenancyId as string, toBedId: bedId });
        onDone();
      } catch (caught) {
        setError(caught instanceof ApiRequestError ? caught.message : 'Could not assign the bed.');
      }
      return;
    }

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
        <Text style={[styles.owed, { color: blocked ? theme.danger : theme.success }]}>
          {blocked
            ? `${found.fullName} already has an active stay here.`
            : awaitingBed
              ? `${found.fullName} is already a resident, waiting on a bed.`
              : `Found ${found.fullName}.`}
        </Text>
      )}

      {found !== null && !blocked && !awaitingBed && (
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
        {found !== null && !blocked && (
          <Button
            label={
              awaitingBed
                ? moveResident.isPending
                  ? 'Assigning…'
                  : 'Assign this bed'
                : createResident.isPending
                  ? 'Adding…'
                  : 'Add to this room'
            }
            onPress={() => void assign()}
          />
        )}
      </View>
    </View>
  );
}

type RoomOccupant = NonNullable<RoomView['beds'][number]['occupant']>;

/**
 * The electricity/AC bill for a room, entered directly per resident — the
 * admin decides and types what each person owes, not a meter reading split
 * automatically. Each submission adds a new charge on top of what was
 * already billed this period, rather than replacing it.
 */
function ElectricityBillForm({
  roomId,
  occupants,
  onDone,
}: {
  readonly roomId: string;
  readonly occupants: readonly RoomOccupant[];
  readonly onDone: () => void;
}) {
  const recordBill = useRecordElectricityBill();

  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function setAmount(tenancyId: string, value: string): void {
    setAmounts((current) => ({ ...current, [tenancyId]: value }));
  }

  const entries = occupants
    .map((occupant) => ({
      tenancyId: occupant.tenancyId,
      amountPaise: Math.round(Number(amounts[occupant.tenancyId] ?? '') * 100),
    }))
    .filter((entry) => (amounts[entry.tenancyId] ?? '').trim() !== '');
  const totalPaise = entries.reduce((sum, entry) => sum + (entry.amountPaise || 0), 0);

  async function submit(): Promise<void> {
    setError(null);

    if (entries.length === 0) {
      setError('Enter an amount for at least one resident.');
      return;
    }
    const invalid = entries.some((entry) => !Number.isFinite(entry.amountPaise) || entry.amountPaise <= 0);
    if (invalid) {
      setError('Amounts must be numbers greater than 0.');
      return;
    }

    try {
      await recordBill.mutateAsync({ roomId, periodKey, entries });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save the bill.');
    }
  }

  return (
    <View style={styles.form}>
      <FormField label="Billing period" value={periodKey} onChangeText={setPeriodKey} placeholder="YYYY-MM" />

      {occupants.map((occupant, index) => (
        <FormField
          key={occupant.tenancyId}
          label={`${occupant.residentName} (₹)`}
          value={amounts[occupant.tenancyId] ?? ''}
          onChangeText={(value) => setAmount(occupant.tenancyId, value)}
          placeholder="0"
          keyboardType="decimal-pad"
          autoFocus={index === 0}
        />
      ))}

      {totalPaise > 0 && <Muted>Total: {formatINR(totalPaise, { withPaise: false })}</Muted>}

      {error !== null && <Muted>{error}</Muted>}

      <View style={styles.searchRow}>
        <Button label="Cancel" variant="secondary" onPress={onDone} />
        <Button label={recordBill.isPending ? 'Saving…' : 'Save bill'} onPress={() => void submit()} />
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
