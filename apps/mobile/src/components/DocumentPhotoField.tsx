import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { pickDocumentPhotoFromLibrary, takeDocumentPhoto } from '../lib/documentPhotoPicker';
import { layout, useTheme } from '../theme';
import { Button } from './ui';

/**
 * Take/choose a document photo, with a live preview and an uploading overlay.
 *
 * Never uploads itself — `onPick` hands the local uri to the caller, which
 * decides when to actually upload it (immediately, for a first-time
 * submission; only once "Save" is pressed, for an edit that might be
 * cancelled).
 */
export function DocumentPhotoField({
  photoUri,
  uploading,
  onPick,
}: {
  readonly photoUri: string | null;
  readonly uploading: boolean;
  readonly onPick: (localUri: string) => void;
}) {
  const theme = useTheme();

  async function choose(pick: () => Promise<string | null>): Promise<void> {
    const uri = await pick();
    if (uri !== null) onPick(uri);
  }

  return (
    <>
      {photoUri !== null && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
          {uploading && (
            <View style={[styles.previewOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
              <ActivityIndicator color={theme.textInverse} />
              <Text style={[styles.previewOverlayText, { color: theme.textInverse }]}>Uploading…</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.actionsRow}>
        <Button label="Take photo" variant="secondary" onPress={() => void choose(takeDocumentPhoto)} />
        <Button
          label="Choose from gallery"
          variant="secondary"
          onPress={() => void choose(pickDocumentPhotoFromLibrary)}
        />
      </View>

      {/* Only in a dev build, and only until the picker's native module is in
          the installed dev client — a way to test the rest of the form and
          the upload without needing a real camera/gallery pick every time. */}
      {__DEV__ && (
        <Button
          label="Use a test photo"
          variant="secondary"
          onPress={() => onPick('https://picsum.photos/seed/heaven-hospitality/800/600')}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  previewWrap: { position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: layout.radius.lg },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: layout.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: layout.spacing[2],
  },
  previewOverlayText: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2], flexWrap: 'wrap' },
});
