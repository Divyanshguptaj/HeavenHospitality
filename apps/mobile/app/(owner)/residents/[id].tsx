import { formatINR } from '@heaven/money';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOwnerResident, useUpdateResident } from '../../../src/api/owner';
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
import { layout } from '../../../src/theme';

/** Rupees, for a text field. Blank means "not set", not zero. */
function rupeesField(paise: number | null): string {
  return paise === null ? '' : String(paise / 100);
}

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
      <Screen>
        <LoadingState label="Loading resident…" />
      </Screen>
    );
  }

  if (resident.error || data === undefined) {
    return (
      <Screen>
        <ErrorState
          message={resident.error instanceof ApiRequestError ? resident.error.message : 'Please try again.'}
          onRetry={() => void resident.refetch()}
        />
      </Screen>
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
            <FormField
              label="Expected exit date"
              value={expectedExitDate}
              onChangeText={setExpectedExitDate}
              placeholder="YYYY-MM-DD, blank if none"
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
            <DetailRow label="Email" value={data.email ?? '—'} />
            <DetailRow label="Joined" value={data.joiningDate} />
            <DetailRow label="Leaving" value={data.expectedExitDate ?? '—'} />
            <DetailRow
              label="Rent"
              value={`${formatINR(data.monthlyRentPaise, { withPaise: false })}/month${
                data.monthlyRentOverridePaise !== null ? ' (overridden)' : ''
              }`}
            />
            <DetailRow label="Deposit" value={formatINR(data.securityDepositPaise, { withPaise: false })} />
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
            <DetailRow
              label="Owes"
              value={
                data.outstandingPaise > 0
                  ? formatINR(data.outstandingPaise, { withPaise: false })
                  : 'Paid up'
              }
            />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Recent invoices</CardTitle>
        {data.invoices.length === 0 ? (
          <Muted>No invoices yet.</Muted>
        ) : (
          data.invoices.slice(0, 6).map((invoice, index) => (
            <View key={invoice.id}>
              {index > 0 && <Divider />}
              <View style={styles.rowBetween}>
                <Muted>{`${invoice.periodKey} · ${invoice.status}`}</Muted>
                <Muted>{formatINR(invoice.totalPaise, { withPaise: false })}</Muted>
              </View>
            </View>
          ))
        )}
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
    paddingVertical: layout.spacing[2],
  },
});
