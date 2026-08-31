import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isAdmin, isResident, useAuthStore } from '../src/auth/authStore';
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
 * One app. The public section is the ground floor; a role opens a door off it.
 *
 *   not signed in  → public: browse everything, no account needed
 *   NON_RESIDENT   → the SAME public section, plus a profile
 *   RESIDENT       → their stay: rent, meals, complaints
 *   ADMIN          → the property: money, residents, rooms, issues
 *
 * Public is the default destination, not a fallback. Someone deciding whether to
 * live here must never meet a login wall, and signing up must not change what
 * they can see — a NON_RESIDENT holds no permissions at all, so there would be
 * nothing extra to show them.
 *
 * Every screen behind these groups is authorised by the server independently;
 * this routing is convenience, not security.
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

  // A resident or an admin is sent to their own section; everyone else — signed
  // out, or signed in as a NON_RESIDENT — lands in the public one. Nobody is
  // ever routed to a login screen by default.
  useEffect(() => {
    if (status === 'signedIn') {
      router.replace(isAdmin(user) ? '/(owner)' : isResident(user) ? '/(resident)' : '/(public)');
    } else if (status === 'signedOut') {
      router.replace('/(public)');
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
      <Stack.Screen name="(public)" options={{ headerShown: false }} />
      <Stack.Screen name="(resident)" options={{ headerShown: false }} />
      <Stack.Screen name="(owner)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/welcome" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ title: 'Sign in' }} />
      <Stack.Screen name="(auth)/signup-phone" options={{ title: 'Create account' }} />
      <Stack.Screen name="(auth)/verify-otp" options={{ title: 'Verify number' }} />
      <Stack.Screen name="(auth)/set-password" options={{ title: 'Password' }} />
      <Stack.Screen name="(auth)/forgot-phone" options={{ title: 'Reset password' }} />
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
