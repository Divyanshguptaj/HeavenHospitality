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
import { Body, Button, Card, Muted, PageHeading } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * Creating an account.
 *
 * Every account created here is a RESIDENT — the server decides that, and the
 * app cannot ask for anything else. A new account has no room yet; the owner
 * allocates one, and until then the home screen says so plainly.
 */
export default function SignUpScreen() {
  const theme = useTheme();
  const signUp = useAuthStore((state) => state.signUp);

  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = form.password.length > 0 && form.password.length < 8;
  const canSubmit =
    form.fullName.trim().length >= 2 &&
    form.email.trim().length > 3 &&
    form.password.length >= 8 &&
    !submitting;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      await signUp({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() === '' ? {} : { phone: form.phone.trim() }),
      });
      router.replace('/');
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not create your account. Check your connection and try again.',
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
        <PageHeading title="Create your account" subtitle="For residents of Heaven Hospitality." />

        <Card>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Full name</Text>
            <TextInput
              value={form.fullName}
              onChangeText={(value) => setForm({ ...form, fullName: value })}
              style={inputStyle}
              placeholder="Your name"
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Full name"
              editable={!submitting}
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
            <TextInput
              value={form.email}
              onChangeText={(value) => setForm({ ...form, email: value })}
              style={inputStyle}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              editable={!submitting}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Phone (optional)</Text>
            <TextInput
              value={form.phone}
              onChangeText={(value) => setForm({ ...form, phone: value })}
              style={inputStyle}
              placeholder="9876543210"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              accessibilityLabel="Phone number"
              editable={!submitting}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
            <TextInput
              value={form.password}
              onChangeText={(value) => setForm({ ...form, password: value })}
              style={inputStyle}
              secureTextEntry
              placeholderTextColor={theme.textMuted}
              textContentType="newPassword"
              accessibilityLabel="Password"
              editable={!submitting}
              onSubmitEditing={() => void handleSubmit()}
              returnKeyType="go"
            />
            <Text
              style={[styles.helper, { color: passwordTooShort ? theme.danger : theme.textMuted }]}
            >
              At least 8 characters.
            </Text>
          </View>

          {error !== null && (
            <View
              accessibilityRole="alert"
              style={[styles.errorBox, { backgroundColor: theme.dangerSubtle }]}
            >
              <Text style={{ color: theme.danger }}>{error}</Text>
            </View>
          )}

          <Button
            label={submitting ? 'Creating…' : 'Create account'}
            onPress={() => void handleSubmit()}
          />
        </Card>

        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: theme.primary }]}>I already have an account</Text>
        </Pressable>

        <Muted>
          Your account starts without a room. The manager will allocate one, and your rent and bills
          will appear here after that.
        </Muted>

        <Body>Just looking around? You can browse the property without an account.</Body>
        <Button
          label="Continue as a guest"
          variant="secondary"
          onPress={() => router.replace('/(guest)')}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.spacing[5], gap: layout.spacing[5] },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  helper: { fontSize: layout.fontSize.xs },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  errorBox: { padding: layout.spacing[4], borderRadius: layout.radius.lg },
  link: { minHeight: layout.minTouchTarget, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
