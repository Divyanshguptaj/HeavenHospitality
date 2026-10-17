import type { ResidentCandidateView } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useCreateResident } from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import { ResidentSearch } from '../../../src/components/ResidentSearch';
import { Button, Card, FormField, Muted, PageHeading, Screen } from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { showTemporaryPassword } from '../../../src/lib/temporaryPassword';
import { layout, useTheme } from '../../../src/theme';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Brings someone in as a resident, found by name or phone number.
 *
 * Lists everyone who matches so the right person can be picked. When a full
 * phone number matches nobody, the owner can create the account here: the resident gets a one-time temporary password to sign in with and must
 * choose their own on first sign-in. A room and bed can be assigned afterward
 * from Rooms.
 */
export default function AddResidentScreen() {
  const theme = useTheme();
  const createResident = useCreateResident();

  const [found, setFound] = useState<ResidentCandidateView | null>(null);
  // The full phone number typed when nobody matched, so a new account can be made for it.
  const [newPhone, setNewPhone] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [joiningDate, setJoiningDate] = useState(today());
  // Left blank on purpose, not defaulted to "0" — the owner must type an
  // actual amount, even if that amount is zero, rather than silently skip it.
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const notFound = found === null && newPhone !== null;

  async function submit(): Promise<void> {
    if (found === null && newPhone === null) return;
    setError(null);

    if (found === null && newName.trim().length < 2) {
      setError('Enter their full name.');
      return;
    }

    const depositValue = securityDeposit.trim();
    const depositRupees = Number(depositValue);
    if (depositValue === '' || Number.isNaN(depositRupees) || depositRupees < 0) {
      setError('Enter a security deposit amount — 0 if there isn’t one.');
      return;
    }

    try {
      const created = await createResident.mutateAsync({
        ...(found === null ? {} : { existingUserId: found.id }),
        fullName: found?.fullName ?? newName.trim(),
        phone: found?.phone ?? newPhone ?? '',
        ...(found?.email == null ? {} : { email: found.email }),
        joiningDate,
        securityDepositPaise: Math.round(depositRupees * 100),
      });
      if (created.credential !== null) {
        showTemporaryPassword(created.fullName, found?.phone ?? newPhone ?? '', created.credential);
      }
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the resident.');
    }
  }

  return (
    <Screen>
      <PageHeading title="Add a resident" subtitle="Search by name or phone number and pick the right person. If they have no account yet, enter their full number to create one." />

      <Card>
        <ResidentSearch
          autoFocus
          noMatchHint="No one found. To create a new account, search with their full 10-digit phone number."
          onSelect={setFound}
          onNoMatch={setNewPhone}
        />

        {notFound && (
          <>
            <Muted>
              No account with that number. Create one and give them the temporary password.
            </Muted>
            <FormField
              label="Full name"
              value={newName}
              onChangeText={setNewName}
              placeholder="Rahul Sharma"
              autoCapitalize="words"
            />
          </>
        )}

        {found !== null && (
          <Text
            style={{
              color: found.activeTenancyId === null ? theme.success : theme.danger,
              fontSize: layout.fontSize.sm,
              fontWeight: '600',
            }}
          >
            {found.activeTenancyId === null
              ? `Found ${found.fullName}.`
              : found.hasBed
                ? `${found.fullName} already has an active stay here.`
                : `${found.fullName} is already a resident, waiting on a bed — assign one from Rooms.`}
          </Text>
        )}
      </Card>

      {((found !== null && found.activeTenancyId === null) || notFound) && (
        <Card>
          <DateField label="Joining date" value={joiningDate} onChange={setJoiningDate} />
          <FormField
            label="Security deposit (₹)"
            value={securityDeposit}
            onChangeText={setSecurityDeposit}
            placeholder="Required — 0 if there isn't one"
            keyboardType="decimal-pad"
          />
          <Muted>A room and bed can be assigned afterward from Rooms.</Muted>

          {error !== null && <Muted>{error}</Muted>}

          <Button
            label={
              createResident.isPending
                ? 'Adding…'
                : notFound
                  ? 'Create account and add resident'
                  : 'Add resident'
            }
            onPress={() => void submit()}
          />
        </Card>
      )}
    </Screen>
  );
}
