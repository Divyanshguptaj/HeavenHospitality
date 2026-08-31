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

import { useOtpFlowStore } from '../../src/auth/otpFlowStore';
import { FieldError, FieldLabel, PhoneField } from '../../src/components/authFields';
import { Body, Button, Card, PageHeading } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * Signup, step 1 of 3: which number is yours.
 *
 * No account is created here. All this does is send a code — the account comes
 * into existence two screens later, once the number has been proven.
 */
export default function SignupPhoneScreen() {
  const theme = useTheme();
  const requestCode = useOtpFlowStore((state) => state.requestCode);

  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    const normalized = normalizeIndianPhone(phone);
    if (normalized === null) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await requestCode('SIGNUP', normalized);
      router.push('/(auth)/verify-otp');
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not send the code. Please check your connection.',
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
          title="Create an account"
          subtitle="We'll text you a code to confirm the number is yours."
        />

        <Card>
          <View style={styles.field}>
            <FieldLabel>Mobile number</FieldLabel>
            <PhoneField
              value={phone}
              onChangeText={setPhone}
              editable={!submitting}
              autoFocus
              onSubmitEditing={() => void handleSubmit()}
            />
          </View>

          <FieldError message={error} />

          <Button
            label={submitting ? 'Sending code…' : 'Send code'}
            onPress={() => void handleSubmit()}
          />

          <Body>
            This becomes the number you sign in with, so use one you can receive messages on.
          </Body>
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
