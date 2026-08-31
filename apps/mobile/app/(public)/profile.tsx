import { ROLE_LABELS, formatIndianPhone } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

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
import { NavRow } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Profile — the one tab whose contents depend on who is looking.
 *
 * A guest gets a way in and a way to reach us; a signed-in NON_RESIDENT gets
 * their account. Neither is forced to authenticate to use anything else in this
 * section, which is the whole design: signing up buys a profile, not access.
 *
 * A NON_RESIDENT deliberately sees no rent, no room and no invoices — not
 * because they are hidden, but because there are none. Showing an empty "Your
 * rent" card would imply a tenancy that does not exist.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);

  if (status === 'restoring') return null;

  // --- Not signed in -------------------------------------------------------
  if (user === null) {
    return (
      <Screen>
        <PageHeading
          title="Your account"
          subtitle="You are browsing as a guest. Everything here is open without an account."
        />

        <Card>
          <CardTitle>Already know us?</CardTitle>
          <Body>
            Residents sign in to see their rent, meals and complaints. If you are still deciding,
            you do not need an account at all.
          </Body>
          <View style={styles.actions}>
            <Button label="Sign in" onPress={() => router.push('/(auth)/login')} />
            <Button
              label="Create account"
              variant="secondary"
              onPress={() => router.push('/(auth)/signup-phone')}
            />
          </View>
        </Card>

        <Card style={styles.group}>
          <NavRow
            icon="call-outline"
            title="Contact us"
            subtitle="Call, WhatsApp or email"
            onPress={() => router.push('/(public)/contact')}
          />
          <Separator />
          <NavRow
            icon="information-circle-outline"
            title="About"
            subtitle="Who we are and how moving in works"
            onPress={() => router.push('/(public)/about')}
          />
          <Separator />
          <NavRow
            icon="document-text-outline"
            title="House rules"
            subtitle="What we ask of everyone living here"
            onPress={() => router.push('/(public)/rules')}
          />
        </Card>

        <Muted>
          Creating an account does not commit you to anything. The owner decides who becomes a
          resident.
        </Muted>
      </Screen>
    );
  }

  // --- Signed in -----------------------------------------------------------
  const isResident = user.role === 'RESIDENT';
  const isAdmin = user.role === 'ADMIN';

  function confirmSignOut(): void {
    // Not destructive, but disruptive on a shared phone — worth one confirmation
    // rather than a single mis-tap.
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => {
            setSigningOut(false);
            // Back to the public experience, not to a login wall. Signing out
            // returns you to what a guest sees, which is still the whole app.
            router.replace('/(public)');
          });
        },
      },
    ]);
  }

  return (
    <Screen>
      <PageHeading title="Your account" />

      <Card>
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: theme.primarySubtle }]}>
            <Text style={[styles.initial, { color: theme.primary }]}>
              {user.fullName.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{user.fullName}</Text>
            <Text style={[styles.phone, { color: theme.textMuted }]}>
              {formatIndianPhone(user.phone)}
            </Text>
          </View>
        </View>

        <DetailRow label="Status" value={ROLE_LABELS[user.role]} />
        {user.email !== null && <DetailRow label="Email" value={user.email} />}
      </Card>

      {/* The status line a non-resident needs: an account, and no tenancy. */}
      {!isResident && !isAdmin && (
        <Card>
          <CardTitle>Not currently a resident</CardTitle>
          <Body>
            Your account is registered, but you are not living here yet — so there is no rent, room
            or bill to show. When the owner accepts you as a tenant, this app will show your stay.
          </Body>
          <Button label="See available rooms" onPress={() => router.push('/(public)/rooms')} />
        </Card>
      )}

      {/* A resident or owner who wandered in gets a way back to their own area
          rather than a dead end. The public pages stay available to them. */}
      {(isResident || isAdmin) && (
        <Card>
          <CardTitle>{isAdmin ? 'You manage this property' : 'You live here'}</CardTitle>
          <Body>
            {isAdmin
              ? 'Rent, residents, rooms and issues are in the owner section.'
              : 'Your rent, meals and complaints are in the resident section.'}
          </Body>
          <Button
            label={isAdmin ? 'Open owner area' : 'Open my stay'}
            onPress={() => router.replace(isAdmin ? '/(owner)' : '/(resident)')}
          />
        </Card>
      )}

      {user.memberships.length > 0 && (
        <Card>
          <CardTitle>Property</CardTitle>
          {user.memberships.map((membership) => (
            <DetailRow
              key={membership.propertyId}
              label={ROLE_LABELS[membership.role]}
              value={membership.propertyName}
            />
          ))}
        </Card>
      )}

      <Card>
        <CardTitle>Signing out</CardTitle>
        <Body>
          Signing out revokes this device&apos;s session on the server, so it cannot be reused even
          if the phone is lost. You can keep browsing afterwards without an account.
        </Body>
        <Button
          label={signingOut ? 'Signing out…' : 'Sign out'}
          variant="secondary"
          onPress={confirmSignOut}
        />
      </Card>

      <Muted>
        Contact the manager to correct your name or number — changing a mobile number needs
        re-verification, so it is not something the app does on its own.
      </Muted>
    </Screen>
  );
}

function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: layout.spacing[4] },
  group: { gap: 0, padding: layout.spacing[1] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: layout.spacing[10] },

  identity: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[4] },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: layout.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: layout.fontSize.xl, fontWeight: '600' },
  identityText: { flex: 1, gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.lg, fontWeight: '600' },
  phone: { fontSize: layout.fontSize.sm, fontVariant: ['tabular-nums'] },
});
