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

/**
 * The owner's account, and the way out of it.
 *
 * There is no "switch to resident" toggle anywhere in the app, and there should
 * not be: the role comes from the account you signed in with, so being able to
 * flip it client-side would hand anyone owner access. Switching means signing
 * out and signing back in as the other person — which is what this screen is
 * for.
 */
export default function OwnerAccountScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);

  if (user === null) return null;

  function confirmSignOut(): void {
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => {
            setSigningOut(false);
            // Back to the public section, which is what the app is for
            // everyone else. Signing in again is one tap away from there.
            router.replace('/(public)');
          });
        },
      },
    ]);
  }

  return (
    <Screen>
      <PageHeading title="Account" subtitle="Signed in as the property owner." />

      <Card>
        <CardTitle>Your details</CardTitle>
        <DetailRow label="Name" value={user.fullName} />
        <DetailRow label="Email" value={user.email ?? '—'} />
        <DetailRow label="Phone" value={user.phone ?? '—'} />
        <DetailRow label="Role" value={user.role} />
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
          app. To use the app as a resident, sign out and sign back in with that resident&apos;s
          email and password.
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
