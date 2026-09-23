import type * as ImagePickerModule from 'expo-image-picker';
import { Alert } from 'react-native';

/**
 * Loaded on demand, not at module scope: this native module only exists in a
 * dev client that was rebuilt after it was added, and importing it eagerly
 * would crash the whole screen for anyone on an older build.
 *
 * Metro "guards" a module whose top-level code throws — it logs the error
 * itself and hands back whatever partial exports resulted, rather than
 * rejecting the `import()` — so a missing native module shows up as
 * functions that are `undefined`, not as a catchable exception.
 */
async function loadImagePicker(): Promise<typeof ImagePickerModule | null> {
  try {
    const module = await import('expo-image-picker');
    if (typeof module.launchImageLibraryAsync !== 'function') throw new Error('native module missing');
    return module;
  } catch {
    Alert.alert(
      'Update needed',
      'The photo picker needs a newer version of the app. Ask the developer to rebuild it.',
    );
    return null;
  }
}

/** Null on cancel, a missing permission, or a missing native module — every case an Alert already explained. */
export async function pickDocumentPhotoFromLibrary(): Promise<string | null> {
  const ImagePicker = await loadImagePicker();
  if (ImagePicker === null) return null;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to attach the photo.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset?.uri ?? null;
}

/** Null on cancel, a missing permission, or a missing native module — every case an Alert already explained. */
export async function takeDocumentPhoto(): Promise<string | null> {
  const ImagePicker = await loadImagePicker();
  if (ImagePicker === null) return null;
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow camera access to attach the photo.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset?.uri ?? null;
}
