import { REGISTRATION_DOCUMENT_TYPE_LABELS, type ResidentDetailView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import {
  useOwnerResident,
  useUpdateElectricityShare,
  useUpdateRegistration,
  useUpdateResident,
} from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import {
  RegistrationFields,
  optionalField,
  registrationToFormValues,
  type RegistrationFormValues,
} from '../../../src/components/RegistrationForm';
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

      <RegistrationCard tenancyId={id} registration={data.registration} />

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

      {data.electricity.length > 0 && (
        <Card>
          <CardTitle>Electricity / AC bills</CardTitle>
          {data.electricity.slice(0, 6).map((share, index) => (
            <View key={share.id}>
              {index > 0 && <Divider />}
              <ElectricityShareRow share={share} />
            </View>
          ))}
        </Card>
      )}

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

/**
 * The admission form. Blank until the resident submits it themselves; from
 * then on the owner is the only one who can change it.
 */
function RegistrationCard({
  tenancyId,
  registration,
}: {
  readonly tenancyId: string;
  readonly registration: ResidentDetailView['registration'];
}) {
  const updateRegistration = useUpdateRegistration();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<RegistrationFormValues>(() => registrationToFormValues(registration));
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<RegistrationFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
  }

  async function save(): Promise<void> {
    setError(null);
    try {
      await updateRegistration.mutateAsync({
        id: tenancyId,
        fatherName: values.fatherName.trim(),
        motherName: values.motherName.trim(),
        parentMobile: values.parentMobile.trim(),
        dateOfBirth: values.dateOfBirth.trim(),
        aadhaarNumber: values.aadhaarNumber.trim(),
        collegeOrInstitute: optionalField(values.collegeOrInstitute),
        courseOrSemester: optionalField(values.courseOrSemester),
        permanentAddress: values.permanentAddress.trim(),
        bloodGroup: values.bloodGroup.trim(),
        parentOccupation: optionalField(values.parentOccupation),
        vehicleNumber: optionalField(values.vehicleNumber),
        ...(values.documentType === null ? {} : { documentType: values.documentType }),
        documentOtherDescription: optionalField(values.documentOtherDescription),
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  if (registration.completedAt === null) {
    return (
      <Card>
        <CardTitle>Registration</CardTitle>
        <Muted>This resident has not submitted the admission form yet.</Muted>
      </Card>
    );
  }

  const documentLabel =
    registration.documentType === null
      ? '—'
      : registration.documentType === 'OTHER'
        ? (registration.documentOtherDescription ?? 'Other')
        : REGISTRATION_DOCUMENT_TYPE_LABELS[registration.documentType];

  return (
    <Card>
      <View style={styles.cardHeader}>
        <CardTitle>Registration</CardTitle>
        {!editing && <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />}
      </View>

      {editing ? (
        <>
          <RegistrationFields values={values} onChange={patch} />
          {error !== null && <Muted>{error}</Muted>}
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setEditing(false);
                setValues(registrationToFormValues(registration));
                setError(null);
              }}
            />
            <Button label={updateRegistration.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
          </View>
        </>
      ) : (
        <>
          <DetailRow label="Father's name" value={registration.fatherName ?? '—'} />
          <DetailRow label="Mother's name" value={registration.motherName ?? '—'} />
          <DetailRow label="Parent's mobile" value={registration.parentMobile ?? '—'} />
          <DetailRow label="Date of birth" value={registration.dateOfBirth ?? '—'} />
          <DetailRow label="Aadhaar number" value={registration.aadhaarNumber ?? '—'} />
          <DetailRow label="College / institute" value={registration.collegeOrInstitute ?? '—'} />
          <DetailRow label="Course / semester" value={registration.courseOrSemester ?? '—'} />
          <DetailRow label="Permanent address" value={registration.permanentAddress ?? '—'} />
          <DetailRow label="Blood group" value={registration.bloodGroup ?? '—'} />
          <DetailRow label="Parent's occupation" value={registration.parentOccupation ?? '—'} />
          <DetailRow label="Vehicle number" value={registration.vehicleNumber ?? '—'} />
          <DetailRow label="Document submitted" value={documentLabel} />
          {registration.documentImageUrl !== null && (
            <Image source={{ uri: registration.documentImageUrl }} style={styles.documentImage} resizeMode="cover" />
          )}
        </>
      )}
    </Card>
  );
}

/**
 * One period's electricity/AC share, with the even/prorated split the server
 * computed shown alongside a way to override it — the split is a starting
 * point, not the final word, for the case where one resident's usage was
 * clearly not typical of their roommates'.
 */
function ElectricityShareRow({
  share,
}: {
  readonly share: ResidentDetailView['electricity'][number];
}) {
  const updateShare = useUpdateElectricityShare();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(share.sharePaise / 100));
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setError(null);
    const rupees = Number(amount);
    if (amount.trim() === '' || Number.isNaN(rupees) || rupees < 0) {
      setError('Enter a valid amount.');
      return;
    }
    try {
      await updateShare.mutateAsync({ id: share.id, sharePaise: Math.round(rupees * 100) });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  if (editing) {
    return (
      <View style={styles.electricityEdit}>
        <Muted>{`${share.periodKey} · room ${share.roomNumber} · ${share.units} units`}</Muted>
        <FormField label="This resident's share (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        {error !== null && <Muted>{error}</Muted>}
        <View style={styles.actionsRow}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => {
              setEditing(false);
              setAmount(String(share.sharePaise / 100));
              setError(null);
            }}
          />
          <Button label={updateShare.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowBetween}>
      <Muted>{`${share.periodKey} · room ${share.roomNumber} · ${share.units} units, ${share.occupiedDays}d`}</Muted>
      <View style={styles.electricityAmount}>
        <Muted>{formatINR(share.sharePaise, { withPaise: false })}</Muted>
        <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />
      </View>
    </View>
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
  electricityAmount: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[3] },
  electricityEdit: { gap: layout.spacing[2], paddingVertical: layout.spacing[2] },
  documentImage: { width: '100%', height: 200, borderRadius: layout.radius.lg },
});
