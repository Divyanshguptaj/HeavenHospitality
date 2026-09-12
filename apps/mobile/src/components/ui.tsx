import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { layout, useTheme } from '../theme';

/**
 * Mobile UI primitives.
 *
 * Every screen composes these rather than styling from scratch, which is what
 * keeps spacing, type and colour consistent. No screen may hard-code a colour,
 * radius or spacing value — they all come from @heaven/tokens via `layout` and
 * `useTheme`.
 *
 * Cards and primary buttons carry a flat, offset "shadow" — a solid block of
 * ink sitting behind them, not a blurred drop shadow — built from nested Views
 * rather than the shadow/elevation APIs, so it renders identically on iOS and
 * Android. A pressed primary button collapses onto its shadow instead of
 * fading, echoing the doorway mark's straight edges rather than a generic
 * rounded-and-blurred look.
 */

interface ScreenProps {
  readonly children: ReactNode;
  /** Supplied when the screen owns a query, to enable pull-to-refresh. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

export function Screen({ children, onRefresh, refreshing = false }: ScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.canvas }}
      contentContainerStyle={styles.screenContent}
      // Content can exceed the viewport on small phones; never clip it.
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh === undefined ? undefined : (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        )
      }
    >
      {children}
    </ScrollView>
  );
}

export function PageHeading({
  title,
  subtitle,
}: {
  readonly title: string;
  // `| undefined` is explicit because exactOptionalPropertyTypes distinguishes
  // "absent" from "present but undefined", and callers pass a nullable field.
  readonly subtitle?: string | undefined;
}) {
  const theme = useTheme();
  return (
    <View style={styles.heading}>
      <View style={[styles.headingBar, { backgroundColor: theme.primary }]} />
      <View style={styles.headingText}>
        <Text accessibilityRole="header" style={[styles.headingTitle, { color: theme.textPrimary }]}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={[styles.headingSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.cardShadow, { backgroundColor: theme.textPrimary }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderStrong }, style]}>
        {children}
      </View>
    </View>
  );
}

export function CardTitle({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{children}</Text>;
}

export function Body({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.body, { color: theme.textSecondary }]}>{children}</Text>;
}

export function Muted({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.muted, { color: theme.textMuted }]}>{children}</Text>;
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Status is never communicated by colour alone — every badge carries a text
 * label, which is what makes it readable to a screen reader and to a colour-blind
 * user. See docs/0001 (accessibility) and the brief's §21.
 */
export function Badge({
  label,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly tone?: BadgeTone;
}) {
  const theme = useTheme();

  const palette: Record<BadgeTone, { background: string; foreground: string }> = {
    neutral: { background: theme.surfaceSubtle, foreground: theme.textSecondary },
    success: { background: theme.successSubtle, foreground: theme.success },
    warning: { background: theme.warningSubtle, foreground: theme.warning },
    danger: { background: theme.dangerSubtle, foreground: theme.danger },
    info: { background: theme.infoSubtle, foreground: theme.info },
  };
  const { background, foreground } = palette[tone];

  return (
    <View style={[styles.badge, { backgroundColor: background, borderColor: foreground }]}>
      <Text style={[styles.badgeLabel, { color: foreground }]}>{label}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  accessibilityLabel,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary';
  readonly accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  if (!isPrimary) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: pressed ? theme.surfaceHover : theme.surface, borderColor: theme.borderStrong },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: theme.textPrimary }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.buttonShadow,
        { backgroundColor: theme.textPrimary, paddingRight: pressed ? 0 : 3, paddingBottom: pressed ? 0 : 3 },
      ]}
    >
      <View style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.textPrimary }]}>
        <Text style={[styles.buttonLabel, { color: theme.textInverse }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** A labelled text input, used across the owner's forms. */
export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  editable = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'phone-pad';
  readonly autoFocus?: boolean;
  readonly editable?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        editable={editable}
        accessibilityLabel={label}
        style={[
          styles.fieldInput,
          {
            backgroundColor: editable ? theme.surface : theme.surfaceSubtle,
            borderColor: theme.border,
            color: theme.textPrimary,
          },
        ]}
      />
    </View>
  );
}

/** A labelled row, used for address, contact and pricing detail. */
export function DetailRow({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{label}</Text>
      <View style={styles.detailValue}>
        {typeof value === 'string' ? (
          <Text style={[styles.body, { color: theme.textPrimary }]}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />;
}

export function LoadingState({ label = 'Loading…' }: { readonly label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.stateBlock} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[styles.body, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.stateBlock} accessibilityRole="alert">
      <Text style={[styles.cardTitle, { color: theme.danger }]}>Something went wrong</Text>
      <Text style={[styles.body, { color: theme.textSecondary, textAlign: 'center' }]}>
        {message}
      </Text>
      <Button label="Try again" onPress={onRetry} />
    </View>
  );
}

export function EmptyState({ message }: { readonly message: string }) {
  const theme = useTheme();
  return (
    <View style={styles.stateBlock}>
      <Text style={[styles.body, { color: theme.textMuted, textAlign: 'center' }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: layout.spacing[5],
    gap: layout.spacing[5],
    paddingBottom: layout.spacing[10],
  },
  heading: { flexDirection: 'row', gap: layout.spacing[4] },
  headingBar: { width: 3, borderRadius: 2 },
  headingText: { flex: 1, gap: layout.spacing[2] },
  headingTitle: {
    fontSize: layout.fontSize['2xl'],
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: layout.fontSize['2xl'] * layout.lineHeight.tight,
  },
  headingSubtitle: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  cardShadow: { borderRadius: layout.radius.lg },
  card: {
    borderWidth: 1.5,
    borderRadius: layout.radius.lg,
    padding: layout.spacing[5],
    gap: layout.spacing[4],
  },
  cardTitle: { fontSize: layout.fontSize.md, fontWeight: '700' },
  body: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  muted: { fontSize: layout.fontSize.sm },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[1] + 2,
  },
  badgeLabel: { fontSize: layout.fontSize.xs, fontWeight: '700' },
  buttonShadow: { borderRadius: layout.radius.md },
  button: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: layout.spacing[6],
    borderRadius: layout.radius.md,
  },
  buttonLabel: { fontSize: layout.fontSize.md, fontWeight: '700' },
  field: { gap: layout.spacing[2] },
  fieldLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  fieldInput: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  detailRow: { flexDirection: 'row', gap: layout.spacing[4], alignItems: 'flex-start' },
  detailLabel: { fontSize: layout.fontSize.sm, width: 96 },
  detailValue: { flex: 1 },
  divider: { height: 1.5 },
  stateBlock: {
    paddingVertical: layout.spacing[9],
    alignItems: 'center',
    gap: layout.spacing[4],
  },
});
