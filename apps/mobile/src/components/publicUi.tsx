import { Ionicons } from '@expo/vector-icons';
import { type FacilityIconKey } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import type { ReactElement, ReactNode } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';

import { ApiRequestError } from '../lib/apiClient';
import { layout, useTheme } from '../theme';

import { ErrorState, LoadingState, Screen } from './ui';

/**
 * Building blocks for the public experience.
 *
 * These exist so the public screens read as one product rather than as six
 * separately-styled pages: one hero treatment, one price format, one
 * availability indicator, one way of opening an external app.
 */

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/**
 * The client's half of the facility icon contract.
 *
 * The server sends a MEANING ("wifi"); this table decides what it looks like.
 * The direction matters: a backend that could name an icon component would be a
 * backend that decides what the app renders. An unrecognised key — which the API
 * already nulls out — falls back to a neutral tick rather than to nothing.
 */
const FACILITY_ICONS: Readonly<Record<FacilityIconKey, keyof typeof Ionicons.glyphMap>> = {
  wifi: 'wifi',
  meals: 'restaurant-outline',
  laundry: 'shirt-outline',
  housekeeping: 'sparkles-outline',
  'power-backup': 'flash-outline',
  security: 'shield-checkmark-outline',
  'hot-water': 'thermometer-outline',
  study: 'book-outline',
  ac: 'snow-outline',
  parking: 'bicycle-outline',
  water: 'water-outline',
  gym: 'barbell-outline',
  tv: 'tv-outline',
  lift: 'swap-vertical-outline',
};

const FALLBACK_FACILITY_ICON: keyof typeof Ionicons.glyphMap = 'checkmark-circle-outline';

export function facilityIcon(key: FacilityIconKey | null): keyof typeof Ionicons.glyphMap {
  return key === null ? FALLBACK_FACILITY_ICON : FACILITY_ICONS[key];
}

// ---------------------------------------------------------------------------
// Query plumbing
// ---------------------------------------------------------------------------

/**
 * Renders a screen from one query, with the loading, error and refresh states
 * every screen needs and none of them has to write.
 *
 * Centralising this is what guarantees no public screen ships without an error
 * path — a screen that only handles the happy case is not a finished screen.
 */
export function QueryScreen<T>({
  query,
  emptyMessage,
  children,
}: {
  readonly query: UseQueryResult<T, Error>;
  readonly emptyMessage?: string;
  readonly children: (data: T) => ReactNode;
}): ReactElement {
  const { data, error, isPending, refetch, isRefetching } = query;

  if (isPending) {
    return (
      <Screen>
        <LoadingState label="Loading…" />
      </Screen>
    );
  }

  if (error) {
    // A connection failure and a server refusal are different problems for the
    // person holding the phone, so they get different sentences.
    const message =
      error instanceof ApiRequestError && error.code === 'NOT_FOUND'
        ? (emptyMessage ?? 'This is not available right now.')
        : error instanceof ApiRequestError && error.status === 0
          ? 'No connection to the server. Check your network and try again.'
          : error instanceof ApiRequestError
            ? error.message
            : 'Something went wrong. Please try again.';

    return (
      <Screen>
        <ErrorState message={message} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      {children(data)}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

/**
 * Opens a dialler, WhatsApp, mail client or map, failing gracefully.
 *
 * `canOpenURL` is checked first because a device without the target app (a
 * tablet with no dialler, an emulator without WhatsApp) rejects silently and
 * leaves the button looking broken.
 */
export async function openExternal(url: string, unavailableMessage: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Not available', unavailableMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('Something went wrong', unavailableMessage);
  }
}

/** WhatsApp deep link. The number must be digits only, without the leading '+'. */
export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * The hero image, with a legible overlay.
 *
 * A dark scrim sits under the text rather than the text being placed on a hoped
 * -for dark region: the owner controls the photograph, and white-on-white is the
 * failure mode when they upload a bright one.
 */
export function Hero({
  imageUrl,
  title,
  subtitle,
}: {
  readonly imageUrl: string | null;
  readonly title: string;
  readonly subtitle?: string | null;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.hero, { backgroundColor: theme.surfaceSubtle }]}>
      {imageUrl !== null && (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          // Decorative: the title beside it already names the place.
          accessible={false}
        />
      )}
      <View style={styles.heroScrim} />
      <View style={styles.heroText}>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          {title}
        </Text>
        {subtitle !== null && subtitle !== undefined && (
          <Text style={styles.heroSubtitle}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

/** A section heading with an optional "see all" affordance beside it. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  // `| undefined` is explicit because exactOptionalPropertyTypes distinguishes
  // "absent" from "present but undefined", and callers pass a computed value.
  readonly actionLabel?: string | undefined;
  readonly onAction?: (() => void) | undefined;
}) {
  const theme = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>
        {title}
      </Text>
      {actionLabel !== undefined && onAction !== undefined && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          hitSlop={8}
        >
          <Text style={[styles.sectionAction, { color: theme.primary }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * A price, with the amount and its unit visually separated.
 *
 * Tabular figures so prices line up when scanning down a list of room types —
 * the difference between a price list and a jumble.
 */
export function Price({
  paise,
  unit = '/ month',
  size = 'lg',
}: {
  readonly paise: number;
  readonly unit?: string;
  readonly size?: 'lg' | 'xl';
}) {
  const theme = useTheme();

  return (
    <Text
      style={[
        size === 'xl' ? styles.priceXl : styles.priceLg,
        { color: theme.textPrimary },
      ]}
    >
      {formatINR(paise, { withPaise: false })}
      <Text style={[styles.priceUnit, { color: theme.textMuted }]}> {unit}</Text>
    </Text>
  );
}

/**
 * Availability, said in words.
 *
 * Never colour alone: "3 beds free" reads the same to a screen reader and to
 * someone who cannot distinguish the green from the amber.
 */
export function AvailabilityBadge({ availableBeds }: { readonly availableBeds: number }) {
  const theme = useTheme();

  const full = availableBeds === 0;
  const label = full
    ? 'Fully occupied'
    : `${String(availableBeds)} bed${availableBeds === 1 ? '' : 's'} free`;

  return (
    <View
      style={[
        styles.availability,
        { backgroundColor: full ? theme.warningSubtle : theme.successSubtle },
      ]}
    >
      <View
        style={[styles.availabilityDot, { backgroundColor: full ? theme.warning : theme.success }]}
      />
      <Text style={[styles.availabilityLabel, { color: full ? theme.warning : theme.success }]}>
        {label}
      </Text>
    </View>
  );
}

/** A pill for a room amenity or a short fact. */
export function Chip({ label }: { readonly label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.chip, { backgroundColor: theme.surfaceSubtle }]}>
      <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

/**
 * A tappable row that leads somewhere — the Explore hub and the guest profile
 * are both built from these.
 */
export function NavRow({
  icon,
  title,
  subtitle,
  onPress,
  style,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly subtitle?: string;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle === undefined ? title : `${title}. ${subtitle}`}
      style={({ pressed }) => [
        styles.navRow,
        { backgroundColor: pressed ? theme.surfaceHover : 'transparent' },
        style,
      ]}
    >
      <View style={[styles.navIcon, { backgroundColor: theme.primarySubtle }]}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.navText}>
        <Text style={[styles.navTitle, { color: theme.textPrimary }]}>{title}</Text>
        {subtitle !== undefined && (
          <Text style={[styles.navSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 220,
    borderRadius: layout.radius.xl,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  // A scrim, not a gradient stack: one flat layer is enough to guarantee
  // contrast and costs nothing to render.
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9, 12, 15, 0.42)' },
  heroText: { padding: layout.spacing[5], gap: layout.spacing[2] },
  heroTitle: {
    color: '#ffffff',
    fontSize: layout.fontSize['2xl'],
    fontWeight: '700',
    lineHeight: layout.fontSize['2xl'] * layout.lineHeight.tight,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.snug,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  sectionTitle: { fontSize: layout.fontSize.lg, fontWeight: '600' },
  sectionAction: { fontSize: layout.fontSize.sm, fontWeight: '600' },

  priceLg: { fontSize: layout.fontSize.lg, fontWeight: '600', fontVariant: ['tabular-nums'] },
  priceXl: { fontSize: layout.fontSize.xl, fontWeight: '700', fontVariant: ['tabular-nums'] },
  priceUnit: { fontSize: layout.fontSize.sm, fontWeight: '400' },

  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: layout.spacing[3],
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[2] + 1,
  },
  availabilityDot: { width: 7, height: 7, borderRadius: layout.radius.full },
  availabilityLabel: { fontSize: layout.fontSize.xs, fontWeight: '600' },

  chip: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[2],
  },
  chipLabel: { fontSize: layout.fontSize.sm },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacing[4],
    minHeight: layout.minTouchTarget,
    paddingVertical: layout.spacing[4],
    paddingHorizontal: layout.spacing[4],
    borderRadius: layout.radius.lg,
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: layout.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { flex: 1, gap: 1 },
  navTitle: { fontSize: layout.fontSize.md, fontWeight: '500' },
  navSubtitle: { fontSize: layout.fontSize.sm },
});
