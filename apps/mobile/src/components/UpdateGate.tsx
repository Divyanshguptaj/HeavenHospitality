import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Muted } from './ui';
import {
  applyJavaScriptUpdate,
  downloadAndInstallApk,
  fetchVersionInfo,
  installedVersionCode,
  isUpdateRequired,
  type AppVersionInfo,
} from '../lib/appUpdates';
import { layout, useTheme } from '../theme';

const JAVASCRIPT_UPDATE_BUDGET_MS = 6_000;

type GateState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'open' }
  | { readonly kind: 'blocked'; readonly info: AppVersionInfo };

/**
 * Holds the app closed until it is known to be current.
 *
 *   build too old      → an "Update required" screen; nothing else opens
 *   newer JS bundle    → downloaded and applied before the app opens
 *   server unreachable → the app opens as it is
 */
export function UpdateGate({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<GateState>(__DEV__ ? { kind: 'open' } : { kind: 'checking' });

  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;

    void (async () => {
      const info = await fetchVersionInfo();
      if (cancelled) return;
      if (info !== null && isUpdateRequired(info, installedVersionCode())) {
        setState({ kind: 'blocked', info });
        return;
      }
      await applyJavaScriptUpdate(JAVASCRIPT_UPDATE_BUDGET_MS);
      if (!cancelled) setState({ kind: 'open' });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'open') return <>{children}</>;
  if (state.kind === 'blocked') return <UpdateRequiredScreen info={state.info} />;
  return <CheckingScreen />;
}

function CheckingScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.canvas }]} accessibilityRole="progressbar">
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

function UpdateRequiredScreen({ info }: { readonly info: AppVersionInfo }) {
  const theme = useTheme();
  const [downloading, setDownloading] = useState(false);

  async function update(): Promise<void> {
    if (info.apkUrl === null || downloading) return;
    setDownloading(true);
    await downloadAndInstallApk(info.apkUrl);
    setDownloading(false);
  }

  return (
    <View style={[styles.center, styles.padded, { backgroundColor: theme.canvas }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Update required</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        This version of the app is out of date. Install the new version to keep using it.
      </Text>
      {info.notes !== null && <Muted>{info.notes}</Muted>}
      {info.apkUrl === null ? (
        <Muted>The update is not available yet. Please try again shortly.</Muted>
      ) : (
        <Button
          label={downloading ? 'Downloading…' : 'Update now'}
          onPress={() => void update()}
        />
      )}
      <Muted>
        When the download finishes, tap Install. If Android asks, allow this app to install updates.
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padded: { padding: layout.spacing[6], gap: layout.spacing[4] },
  title: { fontSize: layout.fontSize.xl, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: layout.fontSize.md, textAlign: 'center' },
});
