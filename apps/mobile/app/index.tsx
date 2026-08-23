import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiRequestError, apiRequest } from '../src/lib/apiClient';
import { layout, useTheme } from '../src/theme';

interface Readiness {
  readonly status: 'ready' | 'degraded';
  readonly database: 'up' | 'down';
}

/**
 * Guest entry point — deliberately reachable with no account.
 *
 * In the guest slice this becomes the property browser (facilities, rooms,
 * pricing, coarse availability, contact). For now it proves the thing that
 * actually needs proving in the foundation: the app boots and talks to the API
 * without a token.
 */
export default function GuestHomeScreen() {
  const theme = useTheme();
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: ({ signal }) => apiRequest<Readiness>('/health/ready', { signal }),
  });

  return (
    <ScrollView style={{ backgroundColor: theme.canvas }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Heaven Hospitality</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Browse the property, rooms and facilities. No account needed.
      </Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Connection</Text>

        {isPending ? (
          <View style={styles.row} accessibilityRole="progressbar">
            <ActivityIndicator color={theme.primary} />
            <Text style={[styles.body, { color: theme.textSecondary }]}>Checking…</Text>
          </View>
        ) : error ? (
          <View style={styles.stack}>
            <Text style={[styles.body, { color: theme.danger }]}>
              {error instanceof ApiRequestError
                ? error.message
                : 'Something went wrong. Please try again.'}
            </Text>
            <Pressable
              onPress={() => void refetch()}
              accessibilityRole="button"
              accessibilityLabel="Retry connection check"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: pressed ? theme.primaryHover : theme.primary },
              ]}
            >
              <Text style={[styles.buttonLabel, { color: theme.textInverse }]}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            API {data.status} · database {data.database}
            {isFetching ? ' · refreshing' : ''}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: layout.spacing[5],
    gap: layout.spacing[5],
  },
  title: {
    fontSize: layout.fontSize['2xl'],
    fontWeight: '600',
    lineHeight: layout.fontSize['2xl'] * layout.lineHeight.tight,
  },
  subtitle: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  card: {
    borderWidth: 1,
    borderRadius: layout.radius.xl,
    padding: layout.spacing[5],
    gap: layout.spacing[4],
  },
  cardTitle: {
    fontSize: layout.fontSize.md,
    fontWeight: '600',
  },
  body: {
    fontSize: layout.fontSize.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacing[3],
  },
  stack: {
    gap: layout.spacing[4],
    alignItems: 'flex-start',
  },
  button: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: layout.spacing[5],
    borderRadius: layout.radius.lg,
  },
  buttonLabel: {
    fontSize: layout.fontSize.md,
    fontWeight: '600',
  },
});
