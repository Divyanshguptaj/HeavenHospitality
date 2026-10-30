import { INVOICE_CATEGORY_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  useDeleteResidentData,
  useOwnerResident,
  useResidentSettlements,
  useResetResidentPassword,
  useUpdateRegistration,
  useUpdateResident,
} from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import { SettlementList } from '../../../src/components/SettlementList';
import { RegistrationCard } from '../../../src/components/RegistrationCard';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Divider,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { showTemporaryPassword } from '../../../src/lib/temporaryPassword';
import { layout } from '../../../src/theme';

/** Rupees, for a text field. Blank means "not set", not zero. */
function rupeesField(paise: number | null): string {
  return paise === null ? '' : String(paise / 100);
}

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'NOTICE_PERIOD') return 'warning';
  return 'neutral';
}

/**
 * One resident, in full: contact, stay, rent, emergency contact, and their
 * billing and complaint history. The details above the history are editable —
 * everything else here is what the resident's own actions produced, and
 * changes there go through their specific flows (payments, invoices, move-out)
 * rather than a raw edit.
 */
export default function OwnerResidentDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const resident = useOwnerResident(id);
  const updateResident = useUpdateResident();
  const updateRegistration = useUpdateRegistration();
  const resetPassword = useResetResidentPassword();
  const deleteResident = useDeleteResidentData();
  const settlements = useResidentSettlements(id);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [expectedExitDate, setExpectedExitDate] = useState('');
  const [monthlyRentOverride, setMonthlyRentOverride] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const data = resident.data;

  // Re-seed the form whenever fresh data arrives — after a save, and on the
  // first successful load.
  useEffect(() => {
    if (data === undefined) return;
    setFullName(data.fullName);
    setPhone(data.phone ?? '');
    setExpectedExitDate(data.expectedExitDate ?? '');
    setMonthlyRentOverride(rupeesField(data.monthlyRentOverridePaise));
    setSecurityDeposit(rupeesField(data.securityDepositPaise));
    setEmergencyContactName(data.emergencyContactName ?? '');
    setEmergencyContactPhone(data.emergencyContactPhone ?? '');
  }, [data]);

  if (resident.isPending) {
    return (
      <Screen center>
        <LoadingState label="Loading resident…" />
      </Screen>
    );
  }

  if (resident.error || data === undefined) {
    return (
      <Screen center>
        <ErrorState
          message={resident.error instanceof ApiRequestError ? resident.error.message : 'Please try again.'}
          onRetry={() => void resident.refetch()}
        />
      </Screen>
    );
  }

  const dues = { rent: 0, electricity: 0, lateFee: 0, deposit: 0 };
  for (const invoice of data.invoices) {
    if (invoice.status === 'CANCELLED') continue;
    const lateFee = invoice.outstandingPaise - invoice.principalOutstandingPaise;
    if (invoice.category === 'RENT') dues.rent += invoice.principalOutstandingPaise;
    else if (invoice.category === 'ELECTRICITY') dues.electricity += invoice.principalOutstandingPaise;
    else dues.deposit += invoice.principalOutstandingPaise;
    dues.lateFee += lateFee;
  }

  function confirmDelete(): void {
    if (data === undefined) return;
    const owes =
      data.outstandingPaise > 0 ? ` They still owe ${rupees(data.outstandingPaise)}, which will be lost.` : '';
    Alert.alert(
      `Delete ${data.fullName} permanently?`,
      `This erases their account, photos, documents, bills, payments, receipts and complaints, here and on Cloudinary.${owes} Overview totals will drop. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => {
            deleteResident.mutateAsync(id).then(
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

  async function save(): Promise<void> {
    setError(null);
    try {
      await updateResident.mutateAsync({
        id,
        fullName: fullName.trim(),
        ...(phone.trim() === '' ? {} : { phone: phone.trim() }),
        expectedExitDate: expectedExitDate.trim() === '' ? null : expectedExitDate.trim(),
        monthlyRentOverridePaise:
          monthlyRentOverride.trim() === '' ? null : Math.round(Number(monthlyRentOverride) * 100),
        securityDepositPaise: Math.round((Number(securityDeposit) || 0) * 100),
        emergencyContactName: emergencyContactName.trim() === '' ? null : emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim() === '' ? null : emergencyContactPhone.trim(),
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save changes.');
    }
  }

  return (
    <Screen onRefresh={() => void resident.refetch()} refreshing={resident.isRefetching}>
      <View style={styles.headingRow}>
        <View style={styles.grow}>
          <PageHeading
            title={data.fullName}
            subtitle={
              data.bed === null
                ? 'Not allocated'
                : `${data.bed.roomNumber} · bed ${data.bed.bedLabel} (${data.bed.floorName})`
            }
          />
        </View>
        <Badge label={data.status.replace('_', ' ')} tone={statusTone(data.status)} />
      </View>

      <Card>
        <View style={styles.cardHeader}>
          <CardTitle>Details</CardTitle>
          {!editing && <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />}
        </View>

        {editing ? (
          <>
            <FormField label="Full name" value={fullName} onChangeText={setFullName} />
            <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <DateField
              label="Expected exit date"
              value={expectedExitDate}
              onChange={setExpectedExitDate}
              placeholder="No exit date set"
              clearable
            />
            <FormField
              label="Monthly rent override (₹)"
              value={monthlyRentOverride}
              onChangeText={setMonthlyRentOverride}
              placeholder="Blank uses the room's rent"
              keyboardType="decimal-pad"
            />
            <FormField
              label="Security deposit (₹)"
              value={securityDeposit}
              onChangeText={setSecurityDeposit}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Emergency contact name"
              value={emergencyContactName}
              onChangeText={setEmergencyContactName}
            />
            <FormField
              label="Emergency contact phone"
              value={emergencyContactPhone}
              onChangeText={setEmergencyContactPhone}
              keyboardType="phone-pad"
            />

            {error !== null && <Muted>{error}</Muted>}

            <View style={styles.actionsRow}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setEditing(false);
                  setError(null);
                }}
              />
              <Button label={updateResident.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
            </View>
          </>
        ) : (
          <>
            <DetailRow label="Phone" value={data.phone ?? '—'} />
            <DetailRow label="Joined" value={data.joiningDate} />
            <DetailRow label="Leaving" value={data.expectedExitDate ?? '—'} />
            <DetailRow
              label="Room"
              value={
                data.bed === null
                  ? '—'
                  : `${data.bed.roomNumber} · bed ${data.bed.bedLabel} · ${data.bed.roomType}`
              }
            />
            <DetailRow
              label="Emergency"
              value={
                data.emergencyContactName === null
                  ? '—'
                  : `${data.emergencyContactName}${
                      data.emergencyContactPhone === null ? '' : ` · ${data.emergencyContactPhone}`
                    }`
              }
            />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>What they owe</CardTitle>
        <DetailRow label="Rent" value={rupees(dues.rent)} />
        <DetailRow label="Electricity bill" value={rupees(dues.electricity)} />
        <DetailRow label="Late fee" value={rupees(dues.lateFee)} />
        <DetailRow label="Deposit" value={rupees(dues.deposit)} />
        <Divider />
        <DetailRow
          label="Total"
          value={data.outstandingPaise > 0 ? rupees(data.outstandingPaise) : 'Paid up'}
        />
      </Card>

      <Card>
        <CardTitle>Sign-in access</CardTitle>
        <Muted>
          Forgot their password? Issue a temporary one. They are signed out everywhere and must
          choose a new password when they sign in.
        </Muted>
        <Button
          label={resetPassword.isPending ? 'Resetting…' : 'Reset password'}
          variant="secondary"
          onPress={() =>
            Alert.alert(
              `Reset password for ${data.fullName}?`,
              'This signs them out everywhere and gives you a new temporary password to hand over.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: () =>
                    void resetPassword.mutateAsync(id).then(
                      (credential) => showTemporaryPassword(data.fullName, data.phone ?? '', credential),
                      (caught: unknown) =>
                        Alert.alert(
                          'Could not reset',
                          caught instanceof ApiRequestError ? caught.message : 'Please try again.',
                        ),
                    ),
                },
              ],
            )
          }
        />
      </Card>

      <RegistrationCard
        registration={data.registration}
        saving={updateRegistration.isPending}
        onSave={(body) => updateRegistration.mutateAsync({ id, ...body })}
      />

      <Card>
        <CardTitle>Recent invoices</CardTitle>
        {data.invoices.length === 0 ? (
          <Muted>No invoices yet.</Muted>
        ) : (
          data.invoices.slice(0, 6).map((invoice, index) => (
            <View key={invoice.id}>
              {index > 0 && <Divider />}
              <View style={styles.rowBetween}>
                <Muted>
                  {`${INVOICE_CATEGORY_LABELS[invoice.category]} · ${invoice.periodKey} · ${invoice.status}`}
                </Muted>
                <Muted>{formatINR(invoice.totalPaise, { withPaise: false })}</Muted>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <CardTitle>Settle up</CardTitle>
        <Muted>
          Forgive part of what they owe (rent, electricity, late fee or deposit) without recording a
          payment. It never counts as collected.
        </Muted>
        <Button
          label="Settle up"
          variant="secondary"
          onPress={() => router.push({ pathname: '/(owner)/residents/settle', params: { id } })}
        />
        {(settlements.data ?? []).length > 0 && <SettlementList settlements={settlements.data ?? []} />}
      </Card>

      <Card>
        <CardTitle>Recent payments</CardTitle>
        {data.payments.length === 0 ? (
          <Muted>No payments recorded yet.</Muted>
        ) : (
          data.payments.slice(0, 6).map((payment, index) => (
            <View key={payment.id}>
              {index > 0 && <Divider />}
              <View style={styles.rowBetween}>
                <Muted>{`${payment.method} · ${payment.status}`}</Muted>
                <Muted>{formatINR(payment.amountPaise, { withPaise: false })}</Muted>
              </View>
            </View>
          ))
        )}
      </Card>

      {data.complaints.length > 0 && (
        <Card>
          <CardTitle>Complaints</CardTitle>
          {data.complaints.slice(0, 6).map((complaint, index) => (
            <View key={complaint.id}>
              {index > 0 && <Divider />}
              <View style={styles.rowBetween}>
                <Muted>{complaint.title}</Muted>
                <Badge label={complaint.status} tone={complaint.status === 'RESOLVED' ? 'success' : 'warning'} />
              </View>
            </View>
          ))}
        </Card>
      )}

      {data.status === 'VACATED' && (
        <Card>
          <CardTitle>Delete resident</CardTitle>
          <Muted>
            They have left. Delete everything about them to free up space: account, photos,
            documents, bills, payments and complaints.
          </Muted>
          <Button
            label={deleteResident.isPending ? 'Deleting…' : 'Delete all their data'}
            variant="secondary"
            onPress={confirmDelete}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: layout.spacing[4] },
  grow: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2] },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: layout.spacing[2],
  },
});
