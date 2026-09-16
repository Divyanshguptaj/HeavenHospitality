import { useState } from 'react';

import { useSubmitRegistration } from '../api/resident';
import { ApiRequestError } from '../lib/apiClient';
import {
  EMPTY_REGISTRATION_FORM,
  RegistrationFields,
  optionalField,
  type RegistrationFormValues,
} from './RegistrationForm';
import { Button, Card, CardTitle, CheckboxRow, Muted, PageHeading, Screen } from './ui';

/**
 * The admission form, blocking the rest of the resident section until it is
 * submitted once. After that, the resident can only view it — corrections go
 * through the manager, from the owner's Residents screen.
 */
export function CompleteRegistrationScreen() {
  const [values, setValues] = useState<RegistrationFormValues>(EMPTY_REGISTRATION_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitRegistration();

  function patch(next: Partial<RegistrationFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (!termsAccepted) {
      setError('Please agree to the terms and conditions to continue.');
      return;
    }
    try {
      await submit.mutateAsync({
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
        documentAadhaarCard: values.documentAadhaarCard,
        documentCollegeId: values.documentCollegeId,
        documentPassportPhoto: values.documentPassportPhoto,
        documentOtherDescription: optionalField(values.documentOtherDescription),
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
        <CheckboxRow
          label="I agree to the terms and conditions"
          checked={termsAccepted}
          onToggle={() => setTermsAccepted((current) => !current)}
        />
        {error !== null && <Muted>{error}</Muted>}
        <Button
          label={submit.isPending ? 'Submitting…' : 'Submit'}
          onPress={() => void handleSubmit()}
        />
      </Card>
    </Screen>
  );
}
