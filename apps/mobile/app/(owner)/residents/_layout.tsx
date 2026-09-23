import { Stack } from 'expo-router';

/**
 * A real stack for the Residents tab, not a flat Tabs screen.
 *
 * Without this, tapping into a resident (or Add) and pressing back would
 * leave the Tabs navigator and land on whatever the default tab is, rather
 * than returning to the roster. Nesting a Stack here gives both screens a
 * proper back arrow and back-button behaviour.
 */
export default function ResidentsLayout() {
  return (
    // Every screen below already has its own PageHeading; a native header
    // above it too would be redundant, the same as everywhere else in the app.
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
