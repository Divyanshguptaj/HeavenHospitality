import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuthStore } from '../../src/auth/authStore';
import { layout, useTheme } from '../../src/theme';

/**
 * The authenticated resident area.
 *
 * This guard decides what to *render*. Every endpoint behind it authorises
 * independently and resolves the subject from the token, so a resident who
 * reached these screens some other way still could not see anyone else's data.
 *
 * The admission form is handled earlier, by the root layout — but an admin
 * can assign a room to an account that never filled it in (they look someone
 * up by phone; nothing requires the form first), so this checks again rather
 * than trusting that path was already taken.
 */
export default function ResidentLayout() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === 'restoring') return null;
  if (status === 'signedOut') return <Redirect href="/(auth)/login" />;
  if (user?.registrationCompletedAt === null) return <Redirect href="/(auth)/registration" />;

  return (
    // Every screen carries its own PageHeading, so the native header is off
    // — `title` stays only where it still does something: the tab bar's own
    // label.
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: layout.fontSize.xs },
        sceneStyle: { backgroundColor: theme.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rent"
        options={{
          title: 'Rent',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="mess"
        options={{
          title: 'Mess',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="complaints"
        options={{
          title: 'Complaints',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
