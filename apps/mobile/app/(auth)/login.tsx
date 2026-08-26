import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import { Body, Button, Card, PageHeading } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * Sign-in for everyone.
 *
 * One screen for both the owner and residents — the ROLE on the account decides
 * which section of the app opens next, not which form you used to get in.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const signIn = useAuthStore((state) => state.signIn);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      await signIn(identifier, password);
      // The root layout routes by role once the session lands.
      router.replace('/');
    } catch (caught) {
      // The server deliberately reports "no such user" and "wrong password"
      // identically; the UI must not try to be more specific than that.
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not sign in. Please check your connection.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PageHeading title="Sign in" subtitle="Residents and the property owner sign in here." />

        <Card>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Email or phone</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              style={inputStyle}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              accessibilityLabel="Email or phone number"
              editable={!submitting}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={inputStyle}
              secureTextEntry
              placeholderTextColor={theme.textMuted}
              textContentType="password"
              accessibilityLabel="Password"
              editable={!submitting}
              onSubmitEditing={() => void handleSubmit()}
              returnKeyType="go"
            />
          </View>

          {error !== null && (
            <View
              accessibilityRole="alert"
              style={[styles.errorBox, { backgroundColor: theme.dangerSubtle }]}
            >
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            </View>
          )}

          <Button
            label={submitting ? 'Signing in…' : 'Sign in'}
            onPress={() => void handleSubmit()}
          />
        </Card>

        <Pressable
          onPress={() => router.replace('/(auth)/signup')}
          accessibilityRole="button"
          style={styles.guestLink}
        >
          <Text style={[styles.guestLinkText, { color: theme.primary }]}>
            New here? Create an account
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(guest)')}
          accessibilityRole="button"
          style={styles.guestLink}
        >
          <Text style={[styles.guestLinkText, { color: theme.textSecondary }]}>
            Continue browsing as a guest
          </Text>
        </Pressable>

        <Body>Forgot your password? Please contact the property manager to have it reset.</Body>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.spacing[5], gap: layout.spacing[5] },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  errorBox: { padding: layout.spacing[4], borderRadius: layout.radius.lg },
  errorText: { fontSize: layout.fontSize.sm },
  guestLink: { minHeight: layout.minTouchTarget, justifyContent: 'center', alignItems: 'center' },
  guestLinkText: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
