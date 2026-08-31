import { OTP_CODE_LENGTH } from '@heaven/contracts';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { layout, useTheme } from '../theme';

/**
 * The inputs the auth screens are built from.
 *
 * They exist as shared components because a phone field that behaves one way on
 * login and another on signup is how inconsistent validation gets shipped.
 */

export function FieldLabel({ children }: { readonly children: string }) {
  const theme = useTheme();
  return <Text style={[styles.label, { color: theme.textSecondary }]}>{children}</Text>;
}

export function FieldError({ message }: { readonly message: string | null }) {
  const theme = useTheme();
  if (message === null) return null;

  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
      {message}
    </Text>
  );
}

/**
 * A mobile number field with a fixed `+91`.
 *
 * The country code is shown rather than typed: every number here is Indian, and
 * a free-text field invites "+91 " prefixes that then have to be stripped. The
 * user types the 10 digits they think of as their number.
 */
export function PhoneField({
  value,
  onChangeText,
  editable = true,
  autoFocus = false,
  onSubmitEditing,
}: {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly editable?: boolean;
  readonly autoFocus?: boolean;
  readonly onSubmitEditing?: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.phoneRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.prefix, { borderRightColor: theme.border }]}>
        <Text style={[styles.prefixText, { color: theme.textSecondary }]}>+91</Text>
      </View>
      <TextInput
        value={value}
        // Digits only, capped at 10: the field cannot hold something invalid,
        // so there is nothing to warn about while typing.
        onChangeText={(next) => onChangeText(next.replace(/\D/g, '').slice(0, 10))}
        style={[styles.phoneInput, { color: theme.textPrimary }]}
        placeholder="98765 43210"
        placeholderTextColor={theme.textMuted}
        keyboardType="number-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        accessibilityLabel="Mobile number"
        editable={editable}
        autoFocus={autoFocus}
        maxLength={10}
        returnKeyType="next"
        {...(onSubmitEditing === undefined ? {} : { onSubmitEditing })}
      />
    </View>
  );
}

/** A password field with a show/hide toggle. */
export function PasswordField({
  value,
  onChangeText,
  placeholder = 'Your password',
  label,
  editable = true,
  autoFocus = false,
  isNew = false,
  onSubmitEditing,
}: {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly placeholder?: string;
  readonly label: string;
  readonly editable?: boolean;
  readonly autoFocus?: boolean;
  /** Drives the keychain hint: a new password must not autofill the old one. */
  readonly isNew?: boolean;
  readonly onSubmitEditing?: () => void;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={[styles.phoneRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          style={[styles.phoneInput, { color: theme.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={isNew ? 'newPassword' : 'password'}
          accessibilityLabel={label}
          editable={editable}
          autoFocus={autoFocus}
          returnKeyType="go"
          {...(onSubmitEditing === undefined ? {} : { onSubmitEditing })}
        />
        <Pressable
          onPress={() => setVisible((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
          style={styles.toggle}
        >
          <Text style={[styles.toggleText, { color: theme.primary }]}>
            {visible ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * A six-digit code field.
 *
 * One input rather than six boxes: six boxes look neater in a screenshot and
 * are consistently worse to use — they fight paste, SMS autofill and backspace.
 * This is one field, spaced out, with autofill left intact.
 */
export function OtpField({
  value,
  onChangeText,
  editable = true,
  onComplete,
}: {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly editable?: boolean;
  readonly onComplete?: () => void;
}) {
  const theme = useTheme();
  const completed = useRef(false);

  // Fires once the code is complete, so the common case needs no button press.
  useEffect(() => {
    if (value.length === OTP_CODE_LENGTH && !completed.current) {
      completed.current = true;
      onComplete?.();
    }
    if (value.length < OTP_CODE_LENGTH) completed.current = false;
  }, [value, onComplete]);

  return (
    <TextInput
      value={value}
      onChangeText={(next) => onChangeText(next.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
      style={[
        styles.otp,
        { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
      ]}
      placeholder="------"
      placeholderTextColor={theme.textMuted}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="sms-otp"
      accessibilityLabel={`${OTP_CODE_LENGTH} digit verification code`}
      editable={editable}
      autoFocus
      maxLength={OTP_CODE_LENGTH}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  error: { fontSize: layout.fontSize.sm },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    minHeight: layout.minTouchTarget,
  },
  prefix: {
    paddingHorizontal: layout.spacing[4],
    borderRightWidth: 1,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  prefixText: { fontSize: layout.fontSize.md, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
    minHeight: layout.minTouchTarget,
  },
  toggle: { paddingHorizontal: layout.spacing[4], justifyContent: 'center' },
  toggleText: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  otp: {
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    minHeight: 56,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize['2xl'],
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 12,
  },
});
