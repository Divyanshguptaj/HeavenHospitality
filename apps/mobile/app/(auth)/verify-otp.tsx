import { OTP_CODE_LENGTH } from '@heaven/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { FieldError, OtpField } from '../../src/components/authFields';
import { Body, Button, Card, Muted, PageHeading } from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * The code screen, shared by signup and password reset.
 *
 * One screen rather than two near-identical ones: the flows differ only in
 * which endpoint they call and where they go next, and both of those already
 * live in the flow store. Two copies would drift.
 */
export default function VerifyOtpScreen() {
  const theme = useTheme();
  const purpose = useOtpFlowStore((state) => state.purpose);
  const maskedPhone = useOtpFlowStore((state) => state.maskedPhone);
  const devCode = useOtpFlowStore((state) => state.devCode);
  const cooldownSeconds = useOtpFlowStore((state) => state.resendAvailableInSeconds);
  const verifyCode = useOtpFlowStore((state) => state.verifyCode);
  const resendCode = useOtpFlowStore((state) => state.resendCode);

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(cooldownSeconds);

  // A visible countdown, so "Resend" being disabled is explained rather than
  // just unresponsive.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((current) => current - 1), 1_000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (code.length !== OTP_CODE_LENGTH) {
      setError(`Enter the ${OTP_CODE_LENGTH}-digit code.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await verifyCode(code);
      router.push('/(auth)/set-password');
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not check the code. Please try again.',
      );
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }, [code, verifyCode]);

  async function handleResend(): Promise<void> {
    setError(null);
    setCode('');

    try {
      await resendCode();
      setSecondsLeft(useOtpFlowStore.getState().resendAvailableInSeconds);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not resend the code.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PageHeading
          title="Enter the code"
          subtitle={`We sent a ${OTP_CODE_LENGTH}-digit code to ${maskedPhone}.`}
        />

        <Card>
          <OtpField
            value={code}
            onChangeText={setCode}
            editable={!submitting}
            onComplete={() => void handleSubmit()}
          />

          <FieldError message={error} />

          <Button label={submitting ? 'Checking…' : 'Verify'} onPress={() => void handleSubmit()} />

          <View style={styles.resendRow}>
            {secondsLeft > 0 ? (
              <Muted>Resend available in {secondsLeft}s</Muted>
            ) : (
              <Pressable
                onPress={() => void handleResend()}
                accessibilityRole="button"
                style={styles.link}
              >
                <Text style={[styles.linkText, { color: theme.primary }]}>Resend code</Text>
              </Pressable>
            )}
          </View>
        </Card>

        {devCode !== null && (
          // Development only: the API omits this field entirely in production,
          // so this block cannot render there.
          <Card>
            <Body>Development build — no SMS was sent.</Body>
            <Text style={[styles.devCode, { color: theme.textPrimary }]}>{devCode}</Text>
          </Card>
        )}

        <Pressable
          onPress={() =>
            router.replace(purpose === 'SIGNUP' ? '/(auth)/signup-phone' : '/(auth)/forgot-phone')
          }
          accessibilityRole="button"
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>
            Use a different number
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.spacing[5], gap: layout.spacing[5] },
  resendRow: { alignItems: 'center' },
  link: { minHeight: layout.minTouchTarget, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: layout.fontSize.md, fontWeight: '600' },
  devCode: {
    fontSize: layout.fontSize['2xl'],
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
});
