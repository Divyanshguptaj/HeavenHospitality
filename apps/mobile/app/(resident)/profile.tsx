import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import {
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);

  if (user === null) return null;

  function confirmSignOut(): void {
    // Signing out is not destructive, but it is disruptive on a shared phone —
    // worth one confirmation rather than a single mis-tap.
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => {
            setSigningOut(false);
            // Back to the public section rather than a login wall: signing out
            // returns you to what a guest sees, which is still the whole app.
            router.replace('/(public)');
          });
        },
      },
    ]);
  }

  return (
    <Screen>
      <PageHeading title="Profile" />

      <Card>
        <CardTitle>Your details</CardTitle>
        <DetailRow label="Name" value={user.fullName} />
        <DetailRow label="Email" value={user.email ?? '—'} />
        <DetailRow label="Phone" value={user.phone ?? '—'} />
        <DetailRow label="Role" value={user.role} />
        <Muted>Contact the manager to correct any of these details.</Muted>
      </Card>

      {user.memberships.length > 0 && (
        <Card>
          <CardTitle>Property</CardTitle>
          {user.memberships.map((membership) => (
            <DetailRow
              key={membership.propertyId}
              label={membership.role}
              value={membership.propertyName}
            />
          ))}
        </Card>
      )}

      <Card>
        <CardTitle>Switching accounts</CardTitle>
        <Body>
          What you can see is decided by the account you signed in with, not by a setting in the
          app. Sign out and sign back in with another account to use the app as that person.
        </Body>
        <Muted>
          Signing out revokes this device&apos;s session on the server, so it cannot be reused even
          if the phone is lost.
        </Muted>
        <Button
          label={signingOut ? 'Signing out…' : 'Sign out'}
          variant="secondary"
          onPress={confirmSignOut}
        />
      </Card>
    </Screen>
  );
}
