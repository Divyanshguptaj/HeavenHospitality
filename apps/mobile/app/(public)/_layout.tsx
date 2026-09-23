import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { isAdmin, useAuthStore } from '../../src/auth/authStore';
import { layout, useTheme } from '../../src/theme';

/**
 * The public section — the whole app for anyone who is not signed in, and the
 * same screens a signed-in NON_RESIDENT or RESIDENT sees.
 *
 * Nothing here requires a token. That is the point: someone deciding whether to
 * live here should not have to hand over a phone number to look at the rooms.
 *
 * Five primary destinations, and no more. The bottom bar is for the places
 * somebody goes repeatedly; Facilities, Gallery, Rules, About, Contact and
 * Location are destinations you visit once or twice while deciding, so they live
 * behind Explore. A tab bar with nine icons is a menu nobody reads.
 *
 * Secondary screens are registered here with `href: null`, which keeps them
 * routable and deep-linkable while leaving them out of the bar.
 */
export default function PublicLayout() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  // The same admission-form gate the root layout applies, repeated here so
  // this section can never render for a signed-in account that hasn't
  // completed it — a guarantee independent of whatever the root layout's own
  // redirect is doing at that instant, not a hope that it got there first.
  // A guest who was never signed in at all is exactly who this section
  // exists for, and is never touched by this check.
  if (status === 'signedIn' && !isAdmin(user) && user?.registrationCompletedAt === null) {
    return <Redirect href="/(auth)/registration" />;
  }

  return (
    // Every screen carries its own PageHeading (the landing screen its own
    // hero instead), so the native header is off across the board — `title`
    // stays only where it still does something: the tab bar's own label.
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
      {/* --- Primary destinations ------------------------------------------ */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: 'Rooms',
          tabBarIcon: ({ color, size }) => <Ionicons name="bed-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
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

      {/* --- Secondary: reachable from Explore, absent from the tab bar ----- */}
      <Tabs.Screen name="facilities" options={{ title: 'Facilities', href: null }} />
      <Tabs.Screen name="gallery" options={{ title: 'Gallery', href: null }} />
      <Tabs.Screen name="rules" options={{ title: 'House rules', href: null }} />
      <Tabs.Screen name="about" options={{ title: 'About', href: null }} />
      <Tabs.Screen name="contact" options={{ title: 'Contact', href: null }} />
      <Tabs.Screen name="location" options={{ title: 'Location', href: null }} />
    </Tabs>
  );
}
