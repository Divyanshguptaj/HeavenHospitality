import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { isResidentExperience, useAuthStore } from '../../src/auth/authStore';
import {
  Badge,
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { layout } from '../../src/theme';

/**
 * Resident home.
 *
 * Rent, invoices, payments, electricity, mess and complaints land here as their
 * slices are built. What it establishes today is the thing everything else needs:
 * who is signed in, and what they are allowed to see.
 */
export default function TenantHomeScreen() {
  const user = useAuthStore((state) => state.user);

  if (user === null) return null;

  // Staff and owners are pointed at the admin console rather than shown a
  // half-useful phone version of it. See the brief's §1.
  if (!isResidentExperience(user)) {
    return (
      <Screen>
        <PageHeading title={`Hello, ${user.fullName}`} />
        <Card>
          <View style={styles.roleRow}>
            <CardTitle>Staff account</CardTitle>
            <Badge label={user.primaryRole} tone="warning" />
          </View>
          <Body>
            This app is for residents. Property operations — tenants, billing, occupancy and reports
            — are managed from the admin console on a computer.
          </Body>
          <Muted>Signed in as {user.email ?? user.phone ?? user.fullName}.</Muted>
        </Card>
      </Screen>
    );
  }

  const membership = user.memberships[0];

  return (
    <Screen>
      <PageHeading title={`Hello, ${user.fullName.split(' ')[0] ?? user.fullName}`} />

      <Card>
        <View style={styles.roleRow}>
          <CardTitle>Your residence</CardTitle>
          <Badge label="Resident" tone="success" />
        </View>
        {membership !== undefined ? (
          <DetailRow label="Property" value={membership.propertyName} />
        ) : (
          <Body>You are not currently allocated to a property. Please contact the manager.</Body>
        )}
        <DetailRow label="Signed in as" value={user.email ?? user.phone ?? '—'} />
      </Card>

      <Card>
        <CardTitle>Coming next</CardTitle>
        <Body>
          Rent and invoices, online payment and receipts, electricity readings, mess attendance and
          complaints will appear here as each is released.
        </Body>
        <Muted>
          Nothing on this screen is shared with other residents — you only ever see your own
          records.
        </Muted>
      </Card>

      <Button
        label="Browse the property"
        variant="secondary"
        onPress={() => router.push('/(guest)')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
});
