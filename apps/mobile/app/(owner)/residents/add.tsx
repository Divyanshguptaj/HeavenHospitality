import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { lookupUserByPhone, useCreateResident } from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import { Button, Card, FormField, Muted, PageHeading, Screen } from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { showTemporaryPassword } from '../../../src/lib/temporaryPassword';
import { layout, useTheme } from '../../../src/theme';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type FoundUser = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  activeTenancyId: string | null;
  hasBed: boolean;
};

/**
 * Brings someone in as a resident, found by phone.
 *
 * Searches for an account first. When there is none, the owner can create it
 * here: the resident gets a one-time temporary password to sign in with and must
 * choose their own on first sign-in. A room and bed can be assigned afterward
 * from Rooms.
 */
export default function AddResidentScreen() {
  const theme = useTheme();
  const createResident = useCreateResident();

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [newName, setNewName] = useState('');
  const [checking, setChecking] = useState(false);
  const [joiningDate, setJoiningDate] = useState(today());
  // Left blank on purpose, not defaulted to "0" — the owner must type an
  // actual amount, even if that amount is zero, rather than silently skip it.
  const [securityDeposit, setSecurityDeposit] = useState('');
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

  async function submit(): Promise<void> {
    if (found === null && !notFound) return;
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
        phone: found?.phone ?? phone.trim(),
        ...(found?.email == null ? {} : { email: found.email }),
        joiningDate,
        securityDepositPaise: Math.round(depositRupees * 100),
      });
      if (created.credential !== null) {
        showTemporaryPassword(created.fullName, phone.trim(), created.credential);
      }
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the resident.');
    }
  }

  return (
    <Screen>
      <PageHeading title="Add a resident" subtitle="Search by phone number. If they have no account yet, you can create one." />

      <Card>
        <View style={styles.searchRow}>
          <View style={styles.grow}>
            <FormField
              label="Phone number"
              value={phone}
              onChangeText={(value) => {
                setPhone(value);
                setFound(null);
                setNotFound(false);
              }}
              placeholder="+91XXXXXXXXXX"
              keyboardType="phone-pad"
              autoFocus
            />
          </View>
          <View style={styles.searchButton}>
            <Button label={checking ? 'Searching…' : 'Search'} variant="secondary" onPress={() => void search()} />
          </View>
        </View>

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

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: layout.spacing[3], alignItems: 'flex-end' },
  grow: { flex: 1 },
  searchButton: { paddingBottom: 1 },
});
