import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { lookupUserByPhone, useCreateResident } from '../../../src/api/owner';
import { DateField } from '../../../src/components/DateField';
import { Button, Card, FormField, Muted, PageHeading, Screen } from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
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
 * Searches for an account rather than creating one on the spot: a resident's
 * account comes from their own signup (spec §7), so this only ever assigns an
 * existing account, the same rule the room screen's own "add resident" form
 * follows. A room and bed can be assigned afterward from Rooms.
 */
export default function AddResidentScreen() {
  const theme = useTheme();
  const createResident = useCreateResident();

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [notFound, setNotFound] = useState(false);
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
    if (found === null) return;
    setError(null);

    const depositValue = securityDeposit.trim();
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
        joiningDate,
        securityDepositPaise: Math.round(depositRupees * 100),
      });
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the resident.');
    }
  }

  return (
    <Screen>
      <PageHeading title="Add a resident" subtitle="Search by the phone number they signed up with." />

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
          <Muted>No account with that number. They need to sign up in the app first.</Muted>
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

      {found !== null && found.activeTenancyId === null && (
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
            label={createResident.isPending ? 'Adding…' : 'Add resident'}
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
