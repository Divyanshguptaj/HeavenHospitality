import { formatINR } from '@heaven/money';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  lookupUserByPhone,
  useCreateResident,
  useExitResident,
  useOwnerRoom,
} from '../../../src/api/owner';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorState,
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
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const room = useOwnerRoom(id);
  const exitResident = useExitResident();

  const [assigningBedId, setAssigningBedId] = useState<string | null>(null);

  if (room.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the room…" />
      </Screen>
    );
  }

  if (room.error) {
    return (
      <Screen>
        <ErrorState
          message={room.error instanceof ApiRequestError ? room.error.message : 'Please try again.'}
          onRetry={() => void room.refetch()}
        />
      </Screen>
    );
  }

  const data = room.data;

  function removeResident(
    tenancyId: string,
    bedLabel: string,
    residentName: string,
    outstandingPaise: number,
  ): void {
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
            exitResident.mutateAsync({ id: tenancyId, actualExitDate: today() }).catch((error: unknown) => {
              Alert.alert(
                'Could not remove',
                error instanceof ApiRequestError ? error.message : 'Please try again.',
              );
            });
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
                  label="Remove"
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
    </Screen>
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
    try {
      await createResident.mutateAsync({
        existingUserId: found.id,
        fullName: found.fullName,
        phone: found.phone ?? phone.trim(),
        ...(found.email === null ? {} : { email: found.email }),
        joiningDate: today(),
        bedId,
        securityDepositPaise: 0,
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

const styles = StyleSheet.create({
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
