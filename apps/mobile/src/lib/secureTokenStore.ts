import * as SecureStore from 'expo-secure-store';

/**
 * Refresh-token storage.
 *
 * Uses the OS keystore (iOS Keychain / Android Keystore) via Expo SecureStore.
 * **Never AsyncStorage** — that is plain, world-readable-on-a-rooted-device
 * storage, and OWASP MASVS-STORAGE exists precisely because apps keep putting
 * credentials there.
 *
 * The access token is deliberately absent from this module: it lives in memory
 * only, and dies with the process. See docs/0003-auth-and-sessions.md.
 */
const REFRESH_TOKEN_KEY = 'heaven.refreshToken';

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/** Called on logout and whenever the server reports a revoked session. */
export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
