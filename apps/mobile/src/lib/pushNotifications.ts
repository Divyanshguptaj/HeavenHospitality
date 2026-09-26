import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiRequest } from './apiClient';

import type * as ExpoNotifications from 'expo-notifications';

type NotificationsModule = typeof ExpoNotifications;

const TOKEN_KEY = 'heaven.pushToken';

/**
 * Loads expo-notifications, or null when this build predates it.
 * Metro reports a missing native module as a module without usable functions
 * rather than a thrown import error, so the check is on a known function.
 */
async function loadNotifications(): Promise<NotificationsModule | null> {
  try {
    const module = await import('expo-notifications');
    if (typeof module.getPermissionsAsync !== 'function') return null;
    return module;
  } catch {
    return null;
  }
}

/** Shows notifications as a banner while the app is open. Call once at boot. */
export async function configureForegroundNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (Notifications === null) return;
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
}

/**
 * Asks for permission, gets this install's Expo push token and registers it
 * with the server. Silent on every failure: push is a convenience and must
 * never block sign-in.
 */
export async function registerForPush(): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    if (Notifications === null) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Heaven Hospitality',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    if (projectId === undefined) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiRequest('/me/devices', {
      method: 'POST',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Emulators, denied permission and offline starts all land here.
  }
}

/** Stops this device receiving pushes for the account being signed out. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token === null) return;
    await apiRequest('/me/devices/unregister', { method: 'POST', body: { token } });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Best-effort: the server also disables tokens Expo reports as dead.
  }
}

/**
 * Opens the screen a tapped notification points at, including the one that
 * launched the app from a closed state. Returns the cleanup function.
 */
export async function listenForNotificationTaps(
  open: (route: string) => void,
): Promise<() => void> {
  const Notifications = await loadNotifications();
  if (Notifications === null) return () => undefined;

  const routeOf = (data: unknown): string | null =>
    typeof data === 'object' && data !== null && 'route' in data && typeof data.route === 'string'
      ? data.route
      : null;

  const launch = await Notifications.getLastNotificationResponseAsync();
  const launchRoute = routeOf(launch?.notification.request.content.data);
  if (launchRoute !== null) open(launchRoute);

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeOf(response.notification.request.content.data);
    if (route !== null) open(route);
  });
  return () => subscription.remove();
}
