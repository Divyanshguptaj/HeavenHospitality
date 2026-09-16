import type * as ImagePickerModule from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';

import { useSubmitRegistration } from '../api/resident';
import { ApiRequestError } from '../lib/apiClient';
import { uploadToCloudinary } from '../lib/cloudinary';
import { layout, useTheme } from '../theme';
import { EMPTY_REGISTRATION_FORM, RegistrationFields, type RegistrationFormValues } from './RegistrationForm';
import { Body, Button, Card, CardTitle, CheckboxRow, Muted, PageHeading, Screen } from './ui';

/** Checked before the photo upload, not after — a missed field shouldn't cost an upload. */
function firstMissingFieldError(values: RegistrationFormValues): string | null {
  if (values.fatherName.trim() === '') return "Enter the father's name.";
  if (values.motherName.trim() === '') return "Enter the mother's name.";
  if (values.parentMobile.trim() === '') return "Enter the parent's mobile number.";
  if (values.dateOfBirth.trim() === '') return 'Choose a date of birth.';
  if (values.aadhaarNumber.trim() === '') return 'Enter the Aadhaar number.';
  if (values.collegeOrInstitute.trim() === '') return 'Enter the college or institute.';
  if (values.permanentAddress.trim() === '') return 'Enter the permanent address.';
  if (values.bloodGroup.trim() === '') return 'Enter the blood group.';
  if (values.parentOccupation.trim() === '') return "Enter the parent's occupation.";
  if (values.vehicleNumber.trim() === '') return 'Enter the vehicle number.';
  return null;
}

/**
 * The admission form, blocking the rest of the resident section until it is
 * submitted once. After that, the resident can only view it — corrections go
 * through the manager, from the owner's Residents screen.
 *
 * The attached photo goes straight from the phone to Cloudinary; only the
 * resulting URL is sent to the API, which never sees the file itself.
 */
export function CompleteRegistrationScreen() {
  const theme = useTheme();
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
    const fieldError = firstMissingFieldError(values);
    if (fieldError !== null) {
      setError(fieldError);
      return;
    }
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
          <Button label="Take photo" variant="secondary" onPress={() => void takePhoto()} />
          <Button label="Choose from gallery" variant="secondary" onPress={() => void pickFromLibrary()} />
        </View>

        {/* Only in a dev build, and only until the picker's native module is in
            the installed dev client — a way to test the rest of the form and
            the upload without needing a real camera/gallery pick every time. */}
        {__DEV__ && (
          <Button
            label="Use a test photo"
            variant="secondary"
            onPress={() => setPhotoUri('https://picsum.photos/seed/heaven-hospitality/800/600')}
          />
        )}
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
