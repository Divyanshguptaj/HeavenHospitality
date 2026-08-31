import { normalizeIndianPhone } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import { FieldError, FieldLabel, PasswordField, PhoneField } from '../../src/components/authFields';
import { Button, Card, PageHeading } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * Sign-in for everyone.
 *
 * One screen for the owner and for residents — the ROLE on the account decides
 * which section of the app opens next, not which form you used to get in.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const signIn = useAuthStore((state) => state.signIn);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeIndianPhone(phone);
  const canSubmit = normalized !== null && password.length > 0 && !submitting;

  async function handleSubmit(): Promise<void> {
    if (normalized === null) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (password.length === 0) {
      setError('Enter your password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signIn(normalized, password);
      // The root layout routes by role once the session lands.
      router.replace('/');
    } catch (caught) {
      // The server reports "no such number" and "wrong password" identically;
      // the UI must not try to be more specific than that.
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not sign in. Please check your connection.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PageHeading title="Sign in" subtitle="Use the mobile number registered with us." />

        <Card>
          <View style={styles.field}>
            <FieldLabel>Mobile number</FieldLabel>
            <PhoneField value={phone} onChangeText={setPhone} editable={!submitting} autoFocus />
          </View>

          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
            onSubmitEditing={() => void handleSubmit()}
          />

          <FieldError message={error} />

          <Button
            label={submitting ? 'Signing in…' : 'Sign in'}
            onPress={() => void handleSubmit()}
            accessibilityLabel={canSubmit ? 'Sign in' : 'Sign in — complete the form first'}
          />

          <Pressable
            onPress={() => router.push('/(auth)/forgot-phone')}
            accessibilityRole="button"
            style={styles.link}
          >
            <Text style={[styles.linkText, { color: theme.primary }]}>Forgot your password?</Text>
          </Pressable>
        </Card>

        <Pressable
          onPress={() => router.replace('/(auth)/signup-phone')}
          accessibilityRole="button"
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: theme.primary }]}>
            New here? Create an account
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(public)')}
          accessibilityRole="button"
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>Continue as a guest</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.spacing[5], gap: layout.spacing[5] },
  field: { gap: layout.spacing[2] },
  link: { minHeight: layout.minTouchTarget, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
