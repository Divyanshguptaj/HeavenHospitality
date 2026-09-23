import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useAuthStore } from '../../../src/auth/authStore';
import {
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { NavRow } from '../../../src/components/publicUi';
import { layout, useTheme } from '../../../src/theme';

/**
 * The owner's hub: account details, the way out, and everything that would
 * otherwise crowd the bottom tab bar.
 *
 * Mess menu, the property's public profile, facilities, house rules and the
 * gallery are all things an owner visits occasionally, not every day — the
 * same reasoning that put Explore behind one tab in the public section rather
 * than giving each of its pages its own. As more of the owner's admin work
 * moves into the app, it grows this list, not the tab bar.
 */
export default function OwnerMoreScreen() {
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
      <PageHeading title="More" subtitle="Your account, and everything guests read about this place." />

      <Card style={styles.group}>
        <NavRow
          icon="people-outline"
          title="Applicants"
          subtitle="Signed up and filled the form, no room yet"
          onPress={() => router.push('/(owner)/more/applicants')}
        />
        <Separator />
        <NavRow
          icon="restaurant-outline"
          title="Mess menu"
          subtitle="The weekly menu and meal timings"
          onPress={() => router.push('/(owner)/more/mess-menu')}
        />
        <Separator />
        <NavRow
          icon="home-outline"
          title="Property profile"
          subtitle="About, contact and location"
          onPress={() => router.push('/(owner)/more/property-info')}
        />
        <Separator />
        <NavRow
          icon="sparkles-outline"
          title="Facilities"
          subtitle="What comes with a stay here"
          onPress={() => router.push('/(owner)/more/facilities')}
        />
        <Separator />
        <NavRow
          icon="document-text-outline"
          title="House rules"
          subtitle="What you ask of everyone who lives here"
          onPress={() => router.push('/(owner)/more/rules')}
        />
        <Separator />
        <NavRow
          icon="images-outline"
          title="Gallery"
          subtitle="Photos guests see before they decide"
          onPress={() => router.push('/(owner)/more/gallery')}
        />
      </Card>

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

function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  group: { gap: 0, padding: layout.spacing[1] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: layout.spacing[10] },
});
