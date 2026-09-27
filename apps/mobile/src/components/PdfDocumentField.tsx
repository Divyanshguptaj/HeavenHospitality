import { Image, Linking, StyleSheet, Text, View } from 'react-native';

import { pickPdf, type PickedPdf } from '../lib/pdfPicker';
import { layout, useTheme } from '../theme';
import { Button, Muted } from './ui';

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url);
}

/**
 * Upload a PDF, and nothing else — no camera and no gallery.
 *
 * Never uploads itself: `onPick` hands the chosen file to the caller, which
 * decides when to upload it (immediately for a first submission; only on
 * "Save" for an edit that might be cancelled). `existingUrl` is what is
 * already on file, so an admin editing sees that a document is there and can
 * open it before deciding to replace it.
 */
export function PdfDocumentField({
  picked,
  existingUrl = null,
  uploading = false,
  onPick,
}: {
  readonly picked: PickedPdf | null;
  readonly existingUrl?: string | null;
  readonly uploading?: boolean;
  readonly onPick: (file: PickedPdf) => void;
}) {
  const theme = useTheme();

  async function choose(): Promise<void> {
    const file = await pickPdf();
    if (file !== null) onPick(file);
  }

  const hasSomething = picked !== null || existingUrl !== null;

  return (
    <View style={styles.wrap}>
      {picked !== null ? (
        <Text style={[styles.fileName, { color: theme.textPrimary }]} numberOfLines={1}>
          {picked.name}
        </Text>
      ) : existingUrl !== null ? (
        <Muted>A document is already on file.</Muted>
      ) : (
        <Muted>PDF only, up to 10 MB.</Muted>
      )}

      <View style={styles.actions}>
        <Button
          label={uploading ? 'Uploading…' : hasSomething ? 'Replace PDF' : 'Choose PDF'}
          variant="secondary"
          onPress={() => void choose()}
        />
        {picked === null && existingUrl !== null && (
          <DocumentOpenButton url={existingUrl} label="Open" />
        )}
      </View>
    </View>
  );
}

/** Opens a stored document in whatever app handles it (a browser or PDF viewer). */
export function DocumentOpenButton({
  url,
  label,
}: {
  readonly url: string;
  readonly label: string;
}) {
  return <Button label={label} variant="secondary" onPress={() => void Linking.openURL(url)} />;
}

/**
 * Shows a stored Aadhaar document. New submissions are PDFs, which open in an
 * external viewer; documents uploaded before that rule are still photos and
 * keep rendering inline.
 */
export function StoredDocument({ url, label }: { readonly url: string; readonly label: string }) {
  if (isPdfUrl(url)) return <DocumentOpenButton url={url} label={`Open ${label} (PDF)`} />;
  return <Image source={{ uri: url }} style={styles.legacyImage} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  wrap: { gap: layout.spacing[2] },
  actions: { flexDirection: 'row', gap: layout.spacing[2], flexWrap: 'wrap' },
  fileName: { fontSize: layout.fontSize.md, fontWeight: '600' },
  legacyImage: { width: '100%', height: 200, borderRadius: layout.radius.lg },
});
