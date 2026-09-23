import { REGISTRATION_DOCUMENT_TYPE_LABELS, type RegistrationDetailsView } from '@heaven/contracts';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { DocumentPhotoField } from './DocumentPhotoField';
import {
  RegistrationFields,
  optionalField,
  registrationToFormValues,
  type RegistrationFormValues,
} from './RegistrationForm';
import { Button, Card, CardTitle, DetailRow, Muted } from './ui';
import { ApiRequestError } from '../lib/apiClient';
import { uploadToCloudinary } from '../lib/cloudinary';
import { layout, useTheme } from '../theme';

/**
 * The admission form, read-only until "Edit" is tapped — shared by a
 * resident's own detail page and an applicant's, since only an admin may
 * ever change it, and the edit itself is identical either way. Only where
 * the change actually lands differs, which is entirely `onSave`'s concern.
 */
export function RegistrationCard({
  registration,
  onSave,
  saving,
  emptyMessage = 'This person has not submitted the admission form yet.',
}: {
  readonly registration: RegistrationDetailsView;
  readonly onSave: (input: Record<string, unknown>) => Promise<unknown>;
  readonly saving: boolean;
  readonly emptyMessage?: string;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<RegistrationFormValues>(() => registrationToFormValues(registration));
  // A newly picked local file, staged until Save — cancelling must leave the
  // photo already on file untouched.
  const [newPhotoUri, setNewPhotoUri] = useState<string | null>(null);
  const [newSelfieUri, setNewSelfieUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<RegistrationFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
  }

  async function save(): Promise<void> {
    setError(null);

    let documentImageUrl: string | undefined;
    let photoUrl: string | undefined;
    if (newPhotoUri !== null || newSelfieUri !== null) {
      try {
        setUploadingPhoto(true);
        if (newPhotoUri !== null) documentImageUrl = await uploadToCloudinary(newPhotoUri);
        if (newSelfieUri !== null) photoUrl = await uploadToCloudinary(newSelfieUri);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not upload the photo. Please try again.');
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    try {
      await onSave({
        fatherName: values.fatherName.trim(),
        motherName: values.motherName.trim(),
        parentMobile: values.parentMobile.trim(),
        dateOfBirth: values.dateOfBirth.trim(),
        aadhaarNumber: values.aadhaarNumber.trim(),
        collegeOrInstitute: optionalField(values.collegeOrInstitute),
        courseOrSemester: optionalField(values.courseOrSemester),
        permanentAddress: values.permanentAddress.trim(),
        bloodGroup: values.bloodGroup.trim(),
        parentOccupation: optionalField(values.parentOccupation),
        vehicleNumber: optionalField(values.vehicleNumber),
        ...(values.documentType === null ? {} : { documentType: values.documentType }),
        documentOtherDescription: optionalField(values.documentOtherDescription),
        ...(documentImageUrl === undefined ? {} : { documentImageUrl }),
        ...(photoUrl === undefined ? {} : { photoUrl }),
      });
      setEditing(false);
      setNewPhotoUri(null);
      setNewSelfieUri(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  if (registration.completedAt === null) {
    return (
      <Card>
        <CardTitle>Registration</CardTitle>
        <Muted>{emptyMessage}</Muted>
      </Card>
    );
  }

  const documentLabel =
    registration.documentType === null
      ? '—'
      : registration.documentType === 'OTHER'
        ? (registration.documentOtherDescription ?? 'Other')
        : REGISTRATION_DOCUMENT_TYPE_LABELS[registration.documentType];

  return (
    <Card>
      <View style={styles.cardHeader}>
        <CardTitle>Registration</CardTitle>
        {!editing && <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />}
      </View>

      {editing ? (
        <>
          <RegistrationFields values={values} onChange={patch} />

          <Text style={[styles.photoLabel, { color: theme.textSecondary }]}>Aadhaar photo</Text>
          <DocumentPhotoField
            photoUri={newPhotoUri ?? registration.documentImageUrl}
            uploading={uploadingPhoto}
            onPick={setNewPhotoUri}
          />

          <Text style={[styles.photoLabel, { color: theme.textSecondary }]}>Profile photo</Text>
          <DocumentPhotoField
            photoUri={newSelfieUri ?? registration.photoUrl}
            uploading={uploadingPhoto}
            onPick={setNewSelfieUri}
          />

          {error !== null && <Muted>{error}</Muted>}
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setEditing(false);
                setValues(registrationToFormValues(registration));
                setNewPhotoUri(null);
                setNewSelfieUri(null);
                setError(null);
              }}
            />
            <Button
              label={uploadingPhoto ? 'Uploading photo…' : saving ? 'Saving…' : 'Save'}
              onPress={() => void save()}
            />
          </View>
        </>
      ) : (
        <>
          {registration.photoUrl !== null && (
            <Image source={{ uri: registration.photoUrl }} style={styles.profilePhoto} resizeMode="cover" />
          )}
          <DetailRow label="Father's name" value={registration.fatherName ?? '—'} />
          <DetailRow label="Mother's name" value={registration.motherName ?? '—'} />
          <DetailRow label="Parent's mobile" value={registration.parentMobile ?? '—'} />
          <DetailRow label="Date of birth" value={registration.dateOfBirth ?? '—'} />
          <DetailRow label="Aadhaar number" value={registration.aadhaarNumber ?? '—'} />
          <DetailRow label="College / institute" value={registration.collegeOrInstitute ?? '—'} />
          <DetailRow label="Course / semester" value={registration.courseOrSemester ?? '—'} />
          <DetailRow label="Permanent address" value={registration.permanentAddress ?? '—'} />
          <DetailRow label="Blood group" value={registration.bloodGroup ?? '—'} />
          <DetailRow label="Parent's occupation" value={registration.parentOccupation ?? '—'} />
          <DetailRow label="Vehicle number" value={registration.vehicleNumber ?? '—'} />
          <DetailRow label="Document submitted" value={documentLabel} />
          {registration.documentImageUrl !== null && (
            <Image
              source={{ uri: registration.documentImageUrl }}
              style={styles.documentImage}
              resizeMode="cover"
            />
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[3],
  },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[3] },
  documentImage: { width: '100%', height: 200, borderRadius: layout.radius.lg },
  profilePhoto: { width: 96, height: 96, borderRadius: layout.radius.full },
  photoLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
});
