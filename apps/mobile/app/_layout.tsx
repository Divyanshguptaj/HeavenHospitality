import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiRequestError } from '../src/lib/apiClient';
import { useTheme } from '../src/theme';

/**
 * Root layout.
 *
 * The app boots with **no authentication**: the guest experience is public, so
 * nothing here may block on a token. Authenticated tenant routes live under
 * `app/(tenant)/` and guard themselves.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        // Retrying a 4xx cannot succeed: a 401 stays a 401, and a blanket retry
        // fires three requests per failure and three audit entries with it.
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    // Never retry a write automatically — a retried payment is a duplicate.
    mutations: { retry: false },
  },
});

export default function RootLayout() {
  const theme = useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.textPrimary,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: theme.canvas },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Heaven Hospitality' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
