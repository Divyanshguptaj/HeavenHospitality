import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isOwner, useAuthStore } from '../src/auth/authStore';
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
 * One app, three experiences, chosen by who is signed in.
 *
 *   not signed in  → guest: browse the property, no account needed
 *   RESIDENT       → their stay: rent, meals, complaints
 *   OWNER          → the property: money, residents, rooms, issues
 *
 * The role comes from the account, so signing in is the only thing that decides
 * what you see. Every screen behind these groups is authorised by the server
 * independently — this routing is convenience, not security.
 */
function RootNavigator() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    // Exchange any stored refresh token for a live session, once, at boot.
    void restore();
  }, [restore]);

  // Send a signed-in user to the section matching their role.
  useEffect(() => {
    if (status === 'signedIn') {
      router.replace(isOwner(user) ? '/(owner)' : '/(resident)');
    }
  }, [status, user]);

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
      <Stack.Screen name="(resident)" options={{ headerShown: false }} />
      <Stack.Screen name="(owner)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ title: 'Sign in' }} />
      <Stack.Screen name="(auth)/signup" options={{ title: 'Create account' }} />
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
