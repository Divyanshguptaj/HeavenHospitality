import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
      <Text accessibilityRole="header" style={[styles.headingTitle, { color: theme.textPrimary }]}>
        {title}
      </Text>
      {subtitle !== undefined && (
        <Text style={[styles.headingSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      )}
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
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}
    >
      {children}
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

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

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
  };
  const { background, foreground } = palette[tone];

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
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

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary
            ? pressed
              ? theme.primaryHover
              : theme.primary
            : pressed
              ? theme.surfaceHover
              : theme.surface,
          borderColor: isPrimary ? 'transparent' : theme.borderStrong,
        },
      ]}
    >
      <Text
        style={[styles.buttonLabel, { color: isPrimary ? theme.textInverse : theme.textPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
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
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
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
  heading: { gap: layout.spacing[2] },
  headingTitle: {
    fontSize: layout.fontSize['2xl'],
    fontWeight: '600',
    lineHeight: layout.fontSize['2xl'] * layout.lineHeight.tight,
  },
  headingSubtitle: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  card: {
    borderWidth: 1,
    borderRadius: layout.radius.xl,
    padding: layout.spacing[5],
    gap: layout.spacing[4],
  },
  cardTitle: { fontSize: layout.fontSize.md, fontWeight: '600' },
  body: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  muted: { fontSize: layout.fontSize.sm },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[1] + 2,
  },
  badgeLabel: { fontSize: layout.fontSize.xs, fontWeight: '600' },
  button: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: layout.spacing[6],
    borderRadius: layout.radius.lg,
  },
  buttonLabel: { fontSize: layout.fontSize.md, fontWeight: '600' },
  detailRow: { flexDirection: 'row', gap: layout.spacing[4], alignItems: 'flex-start' },
  detailLabel: { fontSize: layout.fontSize.sm, width: 96 },
  detailValue: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  stateBlock: {
    paddingVertical: layout.spacing[9],
    alignItems: 'center',
    gap: layout.spacing[4],
  },
});
