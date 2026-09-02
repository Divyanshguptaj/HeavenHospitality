import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme';

/**
 * A real stack for the Rooms tab, not a flat Tabs screen.
 *
 * Without this, tapping into a room and pressing back would leave the Tabs
 * navigator (which has no history of its own) and land on whatever the
 * default tab is, rather than returning to the room list. Nesting a Stack
 * here gives the detail screen a proper back arrow and back-button behaviour.
 */
export default function RoomsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      {/* The list already has its own PageHeading; a second, native header
          above it would be redundant. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Room' }} />
    </Stack>
  );
}
