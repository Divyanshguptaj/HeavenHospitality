import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useAuthStore } from '../../src/auth/authStore';
import { layout, useTheme } from '../../src/theme';

/**
 * Guest navigation — the brief's §8: Explore, Rooms, Facilities, Rules, Food,
 * Contact.
 *
 * This whole section is unauthenticated. Nothing here may require a token, and
 * no tab may show tenant, staff or occupancy data.
 */
export default function GuestLayout() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);

  /**
   * The way into the resident area. Shown to everyone: a guest gets the sign-in
   * screen, a signed-in resident jumps straight to their home.
   */
  const headerRight = () => (
    <Pressable
      onPress={() => router.push('/(auth)/login')}
      accessibilityRole="button"
      accessibilityLabel={status === 'signedIn' ? 'Open resident area' : 'Sign in'}
      hitSlop={12}
      style={{
        paddingHorizontal: layout.spacing[5],
        minHeight: layout.minTouchTarget,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.primary, fontWeight: '600', fontSize: layout.fontSize.md }}>
        {status === 'signedIn' ? 'My account' : 'Sign in'}
      </Text>
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerRight,
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
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
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: 'Rooms',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bed-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="facilities"
        options={{
          title: 'Facilities',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: 'Food',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rules"
        options={{
          title: 'Rules',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="contact"
        options={{
          title: 'Contact',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="call-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
