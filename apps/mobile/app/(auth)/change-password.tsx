import { passwordSchema } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import { FieldError, PasswordField } from '../../src/components/authFields';
import { Body, Button, Card, PageHeading, Screen } from '../../src/components/ui';
import { ApiRequestError, apiRequest } from '../../src/lib/apiClient';

/**
 * Shown to anyone signed in with a temporary password, before anything else.
 * Changing it signs every session out, so the next step is a fresh sign-in.
 */
export default function ChangePasswordScreen() {
  const signOut = useAuthStore((state) => state.signOut);

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordProblem =
    password.length === 0
      ? null
      : (passwordSchema.safeParse(password).error?.issues[0]?.message ?? null);

  async function handleSubmit(): Promise<void> {
    if (current.length === 0) {
      setError('Enter the temporary password you were given.');
      return;
    }
    if (passwordProblem !== null || password.length === 0) {
      setError(passwordProblem ?? 'Choose a new password.');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: password },
      });
      await signOut();
      Alert.alert('Password changed', 'Please sign in with your new password.');
      router.replace('/(auth)/login');
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
      <PageHeading
        title="Choose a new password"
        subtitle="You signed in with a temporary password. Set your own to continue."
      />

      <Card>
        <PasswordField
          label="Temporary password"
          placeholder="The one you were given"
          value={current}
          onChangeText={setCurrent}
          editable={!submitting}
        />

        <PasswordField
          label="New password"
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          isNew
        />

        <PasswordField
          label="Confirm new password"
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
          label={submitting ? 'Saving…' : 'Change password'}
          onPress={() => void handleSubmit()}
        />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
