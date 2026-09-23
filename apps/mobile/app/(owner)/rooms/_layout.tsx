import { Stack } from 'expo-router';

/**
 * A real stack for the Rooms tab, not a flat Tabs screen.
 *
 * Without this, tapping into a room and pressing back would leave the Tabs
 * navigator (which has no history of its own) and land on whatever the
 * default tab is, rather than returning to the room list. Nesting a Stack
 * here gives the detail screen a proper back arrow and back-button behaviour.
 */
export default function RoomsLayout() {
  return (
    // Every screen below already has its own PageHeading; a native header
    // above it too would be redundant, the same as everywhere else in the app.
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
