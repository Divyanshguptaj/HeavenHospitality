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
 * Password reset, step 1 of 3.
 *
 * The server answers identically whether or not the number is registered, so
 * this screen must not promise that an account exists — only that a code has
 * been sent if one does.
 */
export default function ForgotPhoneScreen() {
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
      await requestCode('PASSWORD_RESET', normalized);
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
          title="Reset your password"
          subtitle="Enter your mobile number and we'll send you a code."
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
            If this number has an account, a code is on its way. Resetting signs you out on every
            device.
          </Body>
        </Card>

        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: theme.primary }]}>Back to sign in</Text>
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
