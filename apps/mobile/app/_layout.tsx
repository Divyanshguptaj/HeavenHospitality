import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '../src/auth/authStore';
import { ApiRequestError } from '../src/lib/apiClient';
import { useTheme } from '../src/theme';

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

/**
 * Root layout.
 *
 * The app boots into the **guest** experience with no authentication, because
 * browsing the property must not require an account (the brief's §1 and §8).
 * Signing in is an explicit action that opens the resident area.
 */
function RootNavigator() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    // Exchange any stored refresh token for a live session, once, at boot.
    void restore();
  }, [restore]);

  if (status === 'restoring') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.canvas,
        }}
        accessibilityRole="progressbar"
        accessibilityLabel="Starting"
      >
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: theme.canvas } }}>
      <Stack.Screen name="(guest)" options={{ headerShown: false }} />
      <Stack.Screen name="(tenant)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ title: 'Sign in', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
