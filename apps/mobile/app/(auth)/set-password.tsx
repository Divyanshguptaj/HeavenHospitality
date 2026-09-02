import { passwordSchema } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import { submitPasswordReset, useOtpFlowStore } from '../../src/auth/otpFlowStore';
import { FieldError, FieldLabel, PasswordField } from '../../src/components/authFields';
import { Body, Button, Card, PageHeading } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * The last step of both signup and password reset.
 *
 * Which one it is comes from the flow store, because the screen is otherwise
 * identical: choose a password, confirm it, and the verification token proves
 * the number was verified moments ago.
 */
export default function SetPasswordScreen() {
  const theme = useTheme();

  const purpose = useOtpFlowStore((state) => state.purpose);
  const phone = useOtpFlowStore((state) => state.phone);
  const verificationToken = useOtpFlowStore((state) => state.verificationToken);
  const resetFlow = useOtpFlowStore((state) => state.reset);
  const completeSignup = useAuthStore((state) => state.completeSignup);

  const isSignup = purpose === 'SIGNUP';

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validated with the SAME schema the server enforces, so the message a person
  // sees while typing is the rule that will actually be applied.
  const passwordProblem =
    password.length === 0
      ? null
      : (passwordSchema.safeParse(password).error?.issues[0]?.message ?? null);

  async function handleSubmit(): Promise<void> {
    if (verificationToken === null) {
      setError('Your verification expired. Please start again.');
      return;
    }
    if (isSignup && fullName.trim().length === 0) {
      setError('Enter your name.');
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
      if (isSignup) {
        await completeSignup({ phone, verificationToken, fullName: fullName.trim(), password });
        resetFlow();
        // The root layout routes by role once the session lands.
        router.replace('/');
      } else {
        await submitPasswordReset({ phone, verificationToken, password });
        resetFlow();
        Alert.alert('Password changed', 'Please sign in with your new password.');
        router.replace('/(auth)/login');
      }
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PageHeading
          title={isSignup ? 'Create your account' : 'Set a new password'}
          subtitle={
            isSignup
              ? 'Almost done — add your name and set a password to sign in with.'
              : 'You will be signed out everywhere else.'
          }
        />

        <Card>
          {isSignup && (
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
          )}

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
            label={submitting ? 'Saving…' : isSignup ? 'Create account' : 'Change password'}
            onPress={() => void handleSubmit()}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.spacing[5], gap: layout.spacing[5] },
  field: { gap: layout.spacing[2] },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
});
