import { Stack } from 'expo-router';

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
  return (
    // Every screen below already has its own PageHeading; a native header
    // above it too would be redundant, the same as everywhere else in the app.
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="mess-menu" />
      <Stack.Screen name="property-info" />
      <Stack.Screen name="facilities" />
      <Stack.Screen name="rules" />
      <Stack.Screen name="gallery" />
      <Stack.Screen name="applicants" />
      <Stack.Screen name="applicant-details" />
    </Stack>
  );
}
