import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useCreateResident, useOwnerApplicants, useUpdateApplicantRegistration } from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import { RegistrationCard } from '../../../src/components/RegistrationCard';
import {
  Body,
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One applicant's submitted admission form — editable, the same as a
 * resident's own, since only an admin can ever change either — plus the
 * action that turns them into one.
 *
 * "Add as resident" happens right here rather than handing off to Residents'
 * own Add screen: that screen searches by phone to find an account, and this
 * one already has it, so reusing it would mean pushing a *different* tab's
 * stack and leaving this one behind — stranding the admin on a stale "no
 * longer waiting" screen the moment the add succeeds, since by then this
 * applicant is gone from the list.
 */
export default function ApplicantDetailsScreen() {
  const { userId = '' } = useLocalSearchParams<{ userId: string }>();
  const applicants = useOwnerApplicants();
  const updateRegistration = useUpdateApplicantRegistration();
  const createResident = useCreateResident();

  const [joiningDate, setJoiningDate] = useState(today());
  // Left blank on purpose, not defaulted to "0" — the owner must type an
  // actual amount, even if that amount is zero, rather than silently skip it.
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const rows = applicants.data;

  if (applicants.isPending) {
    return (
      <Screen center>
        <LoadingState label="Loading applicant…" />
      </Screen>
    );
  }

  if (applicants.error || rows === undefined) {
    return (
      <Screen center>
        <ErrorState
          message={
            applicants.error instanceof ApiRequestError ? applicants.error.message : 'Please try again.'
          }
          onRetry={() => void applicants.refetch()}
        />
      </Screen>
    );
  }

  const applicant = rows.find((row) => row.userId === userId) ?? null;

  if (applicant === null) {
    return (
      <Screen center>
        <Muted>This applicant is no longer waiting — they may already have a room.</Muted>
        <Button label="Back to applicants" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  async function addAsResident(): Promise<void> {
    if (applicant === null) return;
    setAddError(null);

    if (applicant.phone === null) {
      setAddError('This account has no phone on file.');
      return;
    }

    const depositValue = securityDeposit.trim();
    const depositRupees = Number(depositValue);
    if (depositValue === '' || Number.isNaN(depositRupees) || depositRupees < 0) {
      setAddError('Enter a security deposit amount — 0 if there isn’t one.');
      return;
    }

    try {
      await createResident.mutateAsync({
        existingUserId: applicant.userId,
        fullName: applicant.fullName,
        phone: applicant.phone,
        ...(applicant.email === null ? {} : { email: applicant.email }),
        joiningDate,
        securityDepositPaise: Math.round(depositRupees * 100),
      });
      // Back within this same stack, to Applicants — never a jump to
      // Residents' own tab, which would leave this screen behind mid-flow.
      router.back();
    } catch (caught) {
      setAddError(caught instanceof ApiRequestError ? caught.message : 'Could not add as a resident.');
    }
  }

  return (
    <Screen onRefresh={() => void applicants.refetch()} refreshing={applicants.isRefetching}>
      <PageHeading title={applicant.fullName} subtitle="Submitted admission form" />

      <Card>
        <CardTitle>Contact</CardTitle>
        <DetailRow label="Phone" value={applicant.phone ?? '—'} />
        <DetailRow label="Email" value={applicant.email ?? '—'} />
      </Card>

      <RegistrationCard
        registration={applicant.registration}
        saving={updateRegistration.isPending}
        onSave={(body) => updateRegistration.mutateAsync({ userId: applicant.userId, ...body })}
      />

      <Card>
        <CardTitle>Bring them in</CardTitle>
        <Body>A room and bed can be assigned afterward from Rooms.</Body>
        <DateField label="Joining date" value={joiningDate} onChange={setJoiningDate} />
        <FormField
          label="Security deposit (₹)"
          value={securityDeposit}
          onChangeText={setSecurityDeposit}
          placeholder="Required — 0 if there isn't one"
          keyboardType="decimal-pad"
        />
        {addError !== null && <Muted>{addError}</Muted>}
        <Button
          label={createResident.isPending ? 'Adding…' : 'Add as resident'}
          onPress={() => void addAsResident()}
        />
      </Card>
    </Screen>
  );
}
