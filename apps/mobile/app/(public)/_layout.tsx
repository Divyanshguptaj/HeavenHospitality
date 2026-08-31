import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

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

  return (
    <Tabs
      screenOptions={{
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
      {/* --- Primary destinations ------------------------------------------ */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          // The landing screen carries its own hero, so a title bar above it
          // would just repeat the property name in a smaller font.
          headerShown: false,
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
