import type { RegistrationDetailsView } from '@heaven/contracts';

import { CheckboxRow, FormField } from './ui';

/**
 * The admission form's fields, as plain strings for text inputs. Booleans stay
 * booleans — the document checklist has no format to get wrong.
 */
export interface RegistrationFormValues {
  readonly fatherName: string;
  readonly motherName: string;
  readonly parentMobile: string;
  readonly dateOfBirth: string;
  readonly aadhaarNumber: string;
  readonly collegeOrInstitute: string;
  readonly courseOrSemester: string;
  readonly permanentAddress: string;
  readonly bloodGroup: string;
  readonly parentOccupation: string;
  readonly vehicleNumber: string;
  readonly documentAadhaarCard: boolean;
  readonly documentCollegeId: boolean;
  readonly documentPassportPhoto: boolean;
  readonly documentOtherDescription: string;
}

export const EMPTY_REGISTRATION_FORM: RegistrationFormValues = {
  fatherName: '',
  motherName: '',
  parentMobile: '',
  dateOfBirth: '',
  aadhaarNumber: '',
  collegeOrInstitute: '',
  courseOrSemester: '',
  permanentAddress: '',
  bloodGroup: '',
  parentOccupation: '',
  vehicleNumber: '',
  documentAadhaarCard: false,
  documentCollegeId: false,
  documentPassportPhoto: false,
  documentOtherDescription: '',
};

/** Blank means "leave unset" for these fields, not the literal empty string. */
export function optionalField(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function registrationToFormValues(details: RegistrationDetailsView): RegistrationFormValues {
  return {
    fatherName: details.fatherName ?? '',
    motherName: details.motherName ?? '',
    parentMobile: details.parentMobile ?? '',
    dateOfBirth: details.dateOfBirth ?? '',
    aadhaarNumber: details.aadhaarNumber ?? '',
    collegeOrInstitute: details.collegeOrInstitute ?? '',
    courseOrSemester: details.courseOrSemester ?? '',
    permanentAddress: details.permanentAddress ?? '',
    bloodGroup: details.bloodGroup ?? '',
    parentOccupation: details.parentOccupation ?? '',
    vehicleNumber: details.vehicleNumber ?? '',
    documentAadhaarCard: details.documentAadhaarCard,
    documentCollegeId: details.documentCollegeId,
    documentPassportPhoto: details.documentPassportPhoto,
    documentOtherDescription: details.documentOtherDescription ?? '',
  };
}

/**
 * The fields from the property's paper "Student Registration Form" — father's
 * and mother's names, ID and college details, permanent address, the document
 * checklist. No submit button and no terms checkbox here: those differ between
 * a resident filling this in for the first time and an admin correcting it
 * afterward, so the two screens that use this add their own.
 */
export function RegistrationFields({
  values,
  onChange,
}: {
  readonly values: RegistrationFormValues;
  readonly onChange: (patch: Partial<RegistrationFormValues>) => void;
}) {
  return (
    <>
      <FormField label="Father's name" value={values.fatherName} onChangeText={(v) => onChange({ fatherName: v })} />
      <FormField label="Mother's name" value={values.motherName} onChangeText={(v) => onChange({ motherName: v })} />
      <FormField
        label="Parent's mobile"
        value={values.parentMobile}
        onChangeText={(v) => onChange({ parentMobile: v })}
        keyboardType="phone-pad"
      />
      <FormField
        label="Date of birth"
        value={values.dateOfBirth}
        onChangeText={(v) => onChange({ dateOfBirth: v })}
        placeholder="YYYY-MM-DD"
      />
      <FormField
        label="Aadhaar number"
        value={values.aadhaarNumber}
        onChangeText={(v) => onChange({ aadhaarNumber: v })}
        placeholder="12 digits"
        keyboardType="number-pad"
      />
      <FormField
        label="College / institute"
        value={values.collegeOrInstitute}
        onChangeText={(v) => onChange({ collegeOrInstitute: v })}
        placeholder="Optional"
      />
      <FormField
        label="Course / semester"
        value={values.courseOrSemester}
        onChangeText={(v) => onChange({ courseOrSemester: v })}
        placeholder="Optional"
      />
      <FormField
        label="Permanent address"
        value={values.permanentAddress}
        onChangeText={(v) => onChange({ permanentAddress: v })}
        multiline
      />
      <FormField
        label="Blood group"
        value={values.bloodGroup}
        onChangeText={(v) => onChange({ bloodGroup: v })}
        placeholder="e.g. B+"
      />
      <FormField
        label="Parent's occupation"
        value={values.parentOccupation}
        onChangeText={(v) => onChange({ parentOccupation: v })}
        placeholder="Optional"
      />
      <FormField
        label="Vehicle number"
        value={values.vehicleNumber}
        onChangeText={(v) => onChange({ vehicleNumber: v })}
        placeholder="Optional"
        autoCapitalize="characters"
      />

      <CheckboxRow
        label="Aadhaar card submitted"
        checked={values.documentAadhaarCard}
        onToggle={() => onChange({ documentAadhaarCard: !values.documentAadhaarCard })}
      />
      <CheckboxRow
        label="College ID submitted"
        checked={values.documentCollegeId}
        onToggle={() => onChange({ documentCollegeId: !values.documentCollegeId })}
      />
      <CheckboxRow
        label="Passport photo submitted"
        checked={values.documentPassportPhoto}
        onToggle={() => onChange({ documentPassportPhoto: !values.documentPassportPhoto })}
      />
      <FormField
        label="Other document (if any)"
        value={values.documentOtherDescription}
        onChangeText={(v) => onChange({ documentOtherDescription: v })}
        placeholder="Optional"
      />
    </>
  );
}
