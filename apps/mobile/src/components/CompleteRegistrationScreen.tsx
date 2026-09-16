import type * as ImagePickerModule from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { useSubmitRegistration } from '../api/resident';
import { ApiRequestError } from '../lib/apiClient';
import { uploadToCloudinary } from '../lib/cloudinary';
import { layout } from '../theme';
import { EMPTY_REGISTRATION_FORM, RegistrationFields, type RegistrationFormValues } from './RegistrationForm';
import { Body, Button, Card, CardTitle, CheckboxRow, Muted, PageHeading, Screen } from './ui';

/**
 * The admission form, blocking the rest of the resident section until it is
 * submitted once. After that, the resident can only view it — corrections go
 * through the manager, from the owner's Residents screen.
 *
 * The attached photo goes straight from the phone to Cloudinary; only the
 * resulting URL is sent to the API, which never sees the file itself.
 */
export function CompleteRegistrationScreen() {
  const [values, setValues] = useState<RegistrationFormValues>(EMPTY_REGISTRATION_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitRegistration();

  function patch(next: Partial<RegistrationFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
  }

  // Loaded on demand, not at module scope: this native module only exists in a
  // dev client that was rebuilt after it was added, and importing it eagerly
  // would crash the whole resident section for anyone on an older build.
  async function loadImagePicker(): Promise<typeof ImagePickerModule | null> {
    try {
      return await import('expo-image-picker');
    } catch {
      Alert.alert(
        'Update needed',
        'The photo picker needs a newer version of the app. Ask the developer to rebuild it.',
      );
      return null;
    }
  }

  async function pickFromLibrary(): Promise<void> {
    const ImagePicker = await loadImagePicker();
    if (ImagePicker === null) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach the document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined) setPhotoUri(asset.uri);
  }

  async function takePhoto(): Promise<void> {
    const ImagePicker = await loadImagePicker();
    if (ImagePicker === null) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to attach the document.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined) setPhotoUri(asset.uri);
  }

  async function handleSubmit(): Promise<void> {
    if (uploading || submit.isPending) return;
    setError(null);
    if (values.documentType === null) {
      setError('Choose which document you are submitting.');
      return;
    }
    if (photoUri === null) {
      setError('Attach a photo of the document.');
      return;
    }
    if (!termsAccepted) {
      setError('Please agree to the terms and conditions to continue.');
      return;
    }
    let documentImageUrl: string;
    try {
      setUploading(true);
      documentImageUrl = await uploadToCloudinary(photoUri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the photo. Please try again.');
      return;
    } finally {
      setUploading(false);
    }

    try {
      await submit.mutateAsync({
        fatherName: values.fatherName.trim(),
        motherName: values.motherName.trim(),
        parentMobile: values.parentMobile.trim(),
        dateOfBirth: values.dateOfBirth.trim(),
        aadhaarNumber: values.aadhaarNumber.trim(),
        collegeOrInstitute: values.collegeOrInstitute.trim(),
        courseOrSemester: values.courseOrSemester.trim() === '' ? undefined : values.courseOrSemester.trim(),
        permanentAddress: values.permanentAddress.trim(),
        bloodGroup: values.bloodGroup.trim(),
        parentOccupation: values.parentOccupation.trim(),
        vehicleNumber: values.vehicleNumber.trim(),
        documentType: values.documentType,
        documentOtherDescription:
          values.documentOtherDescription.trim() === '' ? undefined : values.documentOtherDescription.trim(),
        documentImageUrl,
        termsAccepted: true,
      });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not submit. Please try again.');
    }
  }

  return (
    <Screen>
      <PageHeading
        title="Complete your registration"
        subtitle="Fill this in once — the manager keeps it on file and can correct it later if anything changes."
      />

      <Card>
        <CardTitle>Your details</CardTitle>
        <RegistrationFields values={values} onChange={patch} />
      </Card>

      <Card>
        <CardTitle>Attach the document</CardTitle>
        <Body>A photo of the document you selected above, so the manager can verify it.</Body>

        {photoUri !== null && <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />}

        <View style={styles.actionsRow}>
          <Button label="Take photo" variant="secondary" onPress={() => void takePhoto()} />
          <Button label="Choose from gallery" variant="secondary" onPress={() => void pickFromLibrary()} />
        </View>
      </Card>

      <Card>
        <CheckboxRow
          label="I agree to the terms and conditions"
          checked={termsAccepted}
          onToggle={() => setTermsAccepted((current) => !current)}
        />
        {error !== null && <Muted>{error}</Muted>}
        <Button
          label={uploading ? 'Uploading photo…' : submit.isPending ? 'Submitting…' : 'Submit'}
          onPress={() => void handleSubmit()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 200, borderRadius: layout.radius.lg },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2], flexWrap: 'wrap' },
});
