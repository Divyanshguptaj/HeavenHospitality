import { Stack } from 'expo-router';

import { useTheme } from '../../../src/theme';

/**
 * A real stack for the Residents tab, not a flat Tabs screen.
 *
 * Without this, tapping into a resident (or Add) and pressing back would
 * leave the Tabs navigator and land on whatever the default tab is, rather
 * than returning to the roster. Nesting a Stack here gives both screens a
 * proper back arrow and back-button behaviour.
 */
export default function ResidentsLayout() {
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
      <Stack.Screen name="add" options={{ title: 'Add resident' }} />
      <Stack.Screen name="[id]" options={{ title: 'Resident' }} />
    </Stack>
  );
}
