import { normalizeIndianPhone, passwordSchema } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import {
  FieldError,
  FieldLabel,
  PasswordField,
  PhoneField,
} from '../../src/components/authFields';
import { Body, Button, Card, PageHeading, Screen } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * Signup: name, mobile number and password. The account is created and signed in
 * immediately; the root layout then sends a new account to the admission form.
 */
export default function SignupScreen() {
  const theme = useTheme();
  const signUp = useAuthStore((state) => state.signUp);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordProblem =
    password.length === 0
      ? null
      : (passwordSchema.safeParse(password).error?.issues[0]?.message ?? null);

  async function handleSubmit(): Promise<void> {
    const normalized = normalizeIndianPhone(phone);
    if (fullName.trim().length === 0) {
      setError('Enter your name.');
      return;
    }
    if (normalized === null) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (passwordProblem !== null || password.length === 0) {
      setError(passwordProblem ?? 'Choose a password.');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signUp({ phone: normalized, fullName: fullName.trim(), password });
      // No navigation here: the root layout reacts to the session landing and
      // routes a new account to the admission form.
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <PageHeading title="Create an account" subtitle="Your mobile number is what you sign in with." />

      <Card>
        <View style={styles.field}>
          <FieldLabel>Your name</FieldLabel>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.textPrimary,
              },
            ]}
            placeholder="Vikram Iyer"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="words"
            textContentType="name"
            accessibilityLabel="Your name"
            editable={!submitting}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <FieldLabel>Mobile number</FieldLabel>
          <PhoneField value={phone} onChangeText={setPhone} editable={!submitting} />
        </View>

        <PasswordField
          label="Password"
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          isNew
        />

        <PasswordField
          label="Confirm password"
          placeholder="Type it again"
          value={confirm}
          onChangeText={setConfirm}
          editable={!submitting}
          isNew
          onSubmitEditing={() => void handleSubmit()}
        />

        <Body>At least 8 characters, including a letter and a number.</Body>

        <FieldError message={error ?? passwordProblem} />

        <Button
          label={submitting ? 'Creating account…' : 'Create account'}
          onPress={() => void handleSubmit()}
        />
      </Card>

      <Pressable
        onPress={() => router.replace('/(auth)/login')}
        accessibilityRole="button"
        style={styles.link}
      >
        <Text style={[styles.linkText, { color: theme.primary }]}>
          Already have an account? Sign in
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: layout.spacing[2] },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  link: { minHeight: layout.minTouchTarget, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
