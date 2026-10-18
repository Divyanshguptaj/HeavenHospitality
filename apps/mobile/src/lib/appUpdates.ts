import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Linking } from 'react-native';

import { apiRequest } from './apiClient';

export interface AppVersionInfo {
  readonly latestVersionCode: number;
  readonly minVersionCode: number;
  readonly apkUrl: string | null;
  readonly notes: string | null;
}

const VERSION_CHECK_TIMEOUT_MS = 4_000;
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const VIEW_ACTION = 'android.intent.action.VIEW';
const GRANT_READ_URI_PERMISSION = 1;

/** The Android version code of the installed build. */
export function installedVersionCode(): number {
  const code = Number(Application.nativeBuildVersion);
  return Number.isFinite(code) ? code : 0;
}

/** True when the installed build is older than the oldest build the server allows. */
export function isUpdateRequired(info: AppVersionInfo, installed: number): boolean {
  return info.minVersionCode > installed;
}

/** Asks the server for the newest and oldest allowed builds; null when it cannot be reached. */
export async function fetchVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    return await Promise.race([
      apiRequest<AppVersionInfo>('/app/version'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), VERSION_CHECK_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Downloads a newer JavaScript bundle and restarts into it.
 * Returns once the app is running the newest bundle, or when the time budget runs out.
 */
export async function applyJavaScriptUpdate(budgetMs: number): Promise<void> {
  if (!Updates.isEnabled) return;

  const work = (async () => {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  })().catch(() => undefined);

  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, budgetMs))]);
}

/** Downloads the APK and opens Android's installer; falls back to the browser download. */
export async function downloadAndInstallApk(apkUrl: string): Promise<void> {
  try {
    const target = new File(Paths.cache, 'heaven-hospitality-update.apk');
    if (target.exists) target.delete();
    const downloaded = await File.downloadFileAsync(apkUrl, target);

    await IntentLauncher.startActivityAsync(VIEW_ACTION, {
      data: downloaded.contentUri,
      flags: GRANT_READ_URI_PERMISSION,
      type: APK_MIME_TYPE,
    });
  } catch {
    await Linking.openURL(apkUrl);
  }
}
