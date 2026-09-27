import { REGISTRATION_DOCUMENT_TYPE_LABELS } from '@heaven/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet } from 'react-native';

import { useRegistration } from '../../src/api/resident';
import { useAuthStore } from '../../src/auth/authStore';
import {
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { StoredDocument } from '../../src/components/PdfDocumentField';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout } from '../../src/theme';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);

  if (user === null) return null;

  function confirmSignOut(): void {
    // Signing out is not destructive, but it is disruptive on a shared phone —
    // worth one confirmation rather than a single mis-tap.
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => {
            setSigningOut(false);
            // Back to the public section rather than a login wall: signing out
            // returns you to what a guest sees, which is still the whole app.
            router.replace('/(public)');
          });
        },
      },
    ]);
  }

  return (
    <Screen>
      <PageHeading title="Profile" />

      <Card>
        <CardTitle>Your details</CardTitle>
        <DetailRow label="Name" value={user.fullName} />
        <DetailRow label="Email" value={user.email ?? '—'} />
        <DetailRow label="Phone" value={user.phone ?? '—'} />
        <DetailRow label="Role" value={user.role} />
        <Muted>Contact the manager to correct any of these details.</Muted>
      </Card>

      <RegistrationCard />

      {user.memberships.length > 0 && (
        <Card>
          <CardTitle>Property</CardTitle>
          {user.memberships.map((membership) => (
            <DetailRow
              key={membership.propertyId}
              label={membership.role}
              value={membership.propertyName}
            />
          ))}
        </Card>
      )}

      <Card>
        <CardTitle>Switching accounts</CardTitle>
        <Body>
          What you can see is decided by the account you signed in with, not by a setting in the
          app. Sign out and sign back in with another account to use the app as that person.
        </Body>
        <Muted>
          Signing out revokes this device&apos;s session on the server, so it cannot be reused even
          if the phone is lost.
        </Muted>
        <Button
          label={signingOut ? 'Signing out…' : 'Sign out'}
          variant="secondary"
          onPress={confirmSignOut}
        />
      </Card>
    </Screen>
  );
}

/** Read-only: the admission form is the resident's own submission, correctable only by the manager. */
function RegistrationCard() {
  const registration = useRegistration();

  if (registration.isPending) {
    return (
      <Card>
        <LoadingState label="Loading your registration…" />
      </Card>
    );
  }

  if (registration.error || registration.data === undefined) {
    return (
      <Card>
        <ErrorState
          message={
            registration.error instanceof ApiRequestError
              ? registration.error.message
              : 'Please try again.'
          }
          onRetry={() => void registration.refetch()}
        />
      </Card>
    );
  }

  const data = registration.data;
  const documentLabel =
    data.documentType === null
      ? '—'
      : data.documentType === 'OTHER'
        ? (data.documentOtherDescription ?? 'Other')
        : REGISTRATION_DOCUMENT_TYPE_LABELS[data.documentType];

  return (
    <Card>
      <CardTitle>Your registration</CardTitle>
      <DetailRow label="Father's name" value={data.fatherName ?? '—'} />
      <DetailRow label="Mother's name" value={data.motherName ?? '—'} />
      <DetailRow label="Parent's mobile" value={data.parentMobile ?? '—'} />
      <DetailRow label="Date of birth" value={data.dateOfBirth ?? '—'} />
      <DetailRow label="Aadhaar number" value={data.aadhaarNumber ?? '—'} />
      <DetailRow label="College / institute" value={data.collegeOrInstitute ?? '—'} />
      <DetailRow label="Course / semester" value={data.courseOrSemester ?? '—'} />
      <DetailRow label="Permanent address" value={data.permanentAddress ?? '—'} />
      <DetailRow label="Blood group" value={data.bloodGroup ?? '—'} />
      <DetailRow label="Parent's occupation" value={data.parentOccupation ?? '—'} />
      <DetailRow label="Vehicle number" value={data.vehicleNumber ?? '—'} />
      <DetailRow label="Document submitted" value={documentLabel} />
      {data.photoUrl !== null && (
        <Image source={{ uri: data.photoUrl }} style={styles.profilePhoto} resizeMode="cover" />
      )}
      {data.documentImageUrl !== null && (
        <StoredDocument url={data.documentImageUrl} label="Aadhaar card" />
      )}
      {data.parentDocumentUrl !== null && (
        <StoredDocument url={data.parentDocumentUrl} label="parent's Aadhaar card" />
      )}
      <Muted>Submitted — contact the manager to correct any of these details.</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  documentImage: { width: '100%', height: 200, borderRadius: layout.radius.lg },
  profilePhoto: { width: 96, height: 96, borderRadius: layout.radius.full },
});
