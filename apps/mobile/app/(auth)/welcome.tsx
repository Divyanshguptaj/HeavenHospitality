import { router } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { usePublicProperty } from '../../src/api/public';
import { Logo } from '../../src/components/Logo';
import { Body, Button } from '../../src/components/ui';
import { layout, useTheme } from '../../src/theme';

/**
 * The welcome screen — three ways in, and browsing is one of them.
 *
 * The property's name and tagline come from the API like everything else, so
 * renaming the property does not need a release. A neutral fallback covers the
 * first paint and the offline case: this screen must never block on a request,
 * because "continue as guest" is exactly what someone with a bad connection is
 * reaching for.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const { data } = usePublicProperty();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.canvas }]}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.markShadow, { backgroundColor: theme.textPrimary }]}>
            <View style={[styles.mark, { backgroundColor: theme.primary, borderColor: theme.textPrimary }]}>
              <Logo size={34} color={theme.textInverse} />
            </View>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>
            {data?.name ?? 'Welcome'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {data?.tagline ?? 'Rooms, meals and everything else about your stay — in one place.'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Sign in" onPress={() => router.push('/(auth)/login')} />
          <Button
            label="Create an account"
            variant="secondary"
            onPress={() => router.push('/(auth)/signup-phone')}
          />

          <View style={styles.guest}>
            <Body>Just looking around?</Body>
            <Button
              label="Continue as guest"
              variant="secondary"
              onPress={() => router.replace('/(public)')}
              accessibilityLabel="Continue as a guest without an account"
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    padding: layout.spacing[6],
    justifyContent: 'space-between',
  },
  hero: { flex: 1, justifyContent: 'center', gap: layout.spacing[4] },
  markShadow: { alignSelf: 'flex-start', borderRadius: layout.radius.lg },
  mark: {
    width: 68,
    height: 68,
    marginRight: 4,
    marginBottom: 4,
    borderWidth: 1.5,
    borderRadius: layout.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: layout.fontSize['3xl'], fontWeight: '700', letterSpacing: -0.4 },
  subtitle: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  actions: { gap: layout.spacing[3] },
  guest: {
    marginTop: layout.spacing[5],
    gap: layout.spacing[3],
    alignItems: 'stretch',
  },
});
