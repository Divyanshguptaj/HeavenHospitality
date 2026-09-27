import type * as DocumentPickerModule from 'expo-document-picker';
import { Alert } from 'react-native';

export interface PickedPdf {
  readonly uri: string;
  readonly name: string;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Loaded on demand, not at module scope: this native module only exists in a
 * dev client rebuilt after it was added, and importing it eagerly would crash
 * the whole screen for anyone on an older build. A missing native module shows
 * up as functions that are `undefined`, not as a catchable exception.
 */
async function loadDocumentPicker(): Promise<typeof DocumentPickerModule | null> {
  try {
    const module = await import('expo-document-picker');
    if (typeof module.getDocumentAsync !== 'function') throw new Error('native module missing');
    return module;
  } catch {
    Alert.alert(
      'Update needed',
      'Choosing a PDF needs a newer version of the app. Ask the developer to rebuild it.',
    );
    return null;
  }
}

/** Null on cancel, a non-PDF, a file that is too large, or a missing native module — each already explained to the user. */
export async function pickPdf(): Promise<PickedPdf | null> {
  const DocumentPicker = await loadDocumentPicker();
  if (DocumentPicker === null) return null;

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;

  // The picker's type filter is a hint some file managers ignore, so the file
  // itself is checked too.
  const looksLikePdf =
    asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) {
    Alert.alert('PDF only', 'Please choose a PDF file.');
    return null;
  }
  if (asset.size !== undefined && asset.size > MAX_PDF_BYTES) {
    Alert.alert('File too large', 'Please choose a PDF smaller than 10 MB.');
    return null;
  }
  return { uri: asset.uri, name: asset.name };
}
