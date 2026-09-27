import { useState } from 'react';
import { Alert } from 'react-native';

import { useSubmitRegistration } from '../api/resident';
import { useAuthStore } from '../auth/authStore';
import { ApiRequestError } from '../lib/apiClient';
import { uploadToCloudinary } from '../lib/cloudinary';
import type { PickedPdf } from '../lib/pdfPicker';
import { DocumentPhotoField } from './DocumentPhotoField';
import { PdfDocumentField } from './PdfDocumentField';
import {
  EMPTY_REGISTRATION_FORM,
  RegistrationFields,
  optionalField,
  type RegistrationFormValues,
} from './RegistrationForm';
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
  return null;
}

/**
 * The admission form. Shown once, right after signing in or finishing signup,
 * before anything else in the app — submitted once, it never appears again for
 * that account. After that, only an admin can change it, from Residents.
 *
 * The attached photo goes straight from the phone to Cloudinary; only the
 * resulting URL is sent to the API, which never sees the file itself.
 */
export function CompleteRegistrationScreen() {
  const markRegistrationComplete = useAuthStore((state) => state.markRegistrationComplete);
  const signOut = useAuthStore((state) => state.signOut);
  const [values, setValues] = useState<RegistrationFormValues>(EMPTY_REGISTRATION_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [aadhaarPdf, setAadhaarPdf] = useState<PickedPdf | null>(null);
  const [parentPdf, setParentPdf] = useState<PickedPdf | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitRegistration();

  function confirmSignOut(): void {
    Alert.alert(
      'Sign out?',
      'You can finish this later — sign back in and pick up where you left off.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            setSigningOut(true);
            void signOut().finally(() => setSigningOut(false));
          },
        },
      ],
    );
  }

  function patch(next: Partial<RegistrationFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
  }

  async function handleSubmit(): Promise<void> {
    if (uploading || submit.isPending) return;
    setError(null);
    const fieldError = firstMissingFieldError(values);
    if (fieldError !== null) {
      setError(fieldError);
      return;
    }
    if (aadhaarPdf === null) {
      setError('Upload your Aadhaar card as a PDF.');
      return;
    }
    if (parentPdf === null) {
      setError("Upload your parent's Aadhaar card as a PDF.");
      return;
    }
    if (selfieUri === null) {
      setError('Add a photo of yourself.');
      return;
    }
    if (!termsAccepted) {
      setError('Please agree to the terms and conditions to continue.');
      return;
    }
    let documentImageUrl: string;
    let parentDocumentUrl: string;
    let selfieUrl: string;
    try {
      setUploading(true);
      documentImageUrl = await uploadToCloudinary(aadhaarPdf.uri, {
        mimeType: 'application/pdf',
        fileName: aadhaarPdf.name,
      });
      parentDocumentUrl = await uploadToCloudinary(parentPdf.uri, {
        mimeType: 'application/pdf',
        fileName: parentPdf.name,
      });
      selfieUrl = await uploadToCloudinary(selfieUri);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not upload the photo. Please try again.',
      );
      return;
    } finally {
      setUploading(false);
    }

    try {
      const result = await submit.mutateAsync({
        fatherName: values.fatherName.trim(),
        motherName: values.motherName.trim(),
        parentMobile: values.parentMobile.trim(),
        dateOfBirth: values.dateOfBirth.trim(),
        aadhaarNumber: values.aadhaarNumber.trim(),
        collegeOrInstitute: values.collegeOrInstitute.trim(),
        courseOrSemester: optionalField(values.courseOrSemester),
        permanentAddress: values.permanentAddress.trim(),
        bloodGroup: values.bloodGroup.trim(),
        parentOccupation: values.parentOccupation.trim(),
        vehicleNumber: optionalField(values.vehicleNumber),
        documentType: 'AADHAAR_CARD',
        documentImageUrl,
        parentDocumentUrl,
        photoUrl: selfieUrl,
        termsAccepted: true,
      });
      // No navigation here: updating the store is what clears the root
      // layout's redirect gate, and its own effect replaces this screen once
      // it sees that — racing it with an explicit `replace('/')` (which
      // matches no real route) risks that call winning and stranding us on
      // neither this screen nor the destination.
      markRegistrationComplete(result.completedAt ?? new Date().toISOString());
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not submit. Please try again.',
      );
    }
  }

  return (
    <Screen>
      <PageHeading
        title="Complete your registration"
        subtitle="Fill this in once — the manager keeps it on file and can correct it later if anything changes."
      />

      <Button
        label={signingOut ? 'Signing out…' : 'Sign out instead'}
        variant="secondary"
        onPress={confirmSignOut}
      />

      <Card>
        <CardTitle>Your details</CardTitle>
        <RegistrationFields values={values} onChange={patch} />
      </Card>

      <Card>
        <CardTitle>Aadhaar card</CardTitle>
        <Body>Upload your Aadhaar card as a PDF, so the manager can verify it.</Body>
        <PdfDocumentField picked={aadhaarPdf} uploading={uploading} onPick={setAadhaarPdf} />
      </Card>

      <Card>
        <CardTitle>Parent&apos;s Aadhaar card</CardTitle>
        <Body>Upload your parent&apos;s Aadhaar card as a PDF.</Body>
        <PdfDocumentField picked={parentPdf} uploading={uploading} onPick={setParentPdf} />
      </Card>

      <Card>
        <CardTitle>Your photo</CardTitle>
        <Body>A clear, recent photo of your face, so the manager knows who you are.</Body>
        <DocumentPhotoField photoUri={selfieUri} uploading={uploading} onPick={setSelfieUri} />
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
