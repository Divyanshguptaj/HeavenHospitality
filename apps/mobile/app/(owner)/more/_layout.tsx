import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme';

/**
 * A real stack for the More tab, not a flat Tabs screen.
 *
 * Without this, opening one of the editors below and pressing back would
 * leave the Tabs navigator and land on whatever the default tab is, rather
 * than returning to the hub. Nesting a Stack here gives every screen below a
 * proper back arrow and back-button behaviour — the same reasoning as
 * rooms/_layout.tsx and residents/_layout.tsx.
 */
export default function MoreLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      {/* The hub already has its own PageHeading; a second, native header
          above it would be redundant. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="mess-menu" options={{ title: 'Mess menu' }} />
      <Stack.Screen name="property-info" options={{ title: 'Property profile' }} />
      <Stack.Screen name="facilities" options={{ title: 'Facilities' }} />
      <Stack.Screen name="rules" options={{ title: 'House rules' }} />
      <Stack.Screen name="gallery" options={{ title: 'Gallery' }} />
    </Stack>
  );
}
