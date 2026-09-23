import type { RegistrationDetailsView, RegistrationDocumentType } from '@heaven/contracts';

import { DateField } from './DateField';
import { FormField } from './ui';

/**
 * The admission form's fields, as plain strings for text inputs — every one
 * required except course/semester and vehicle number, mirroring the paper
 * form the property already used, where a blank field meant something was
 * missed.
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
  readonly documentType: RegistrationDocumentType | null;
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
  // Always Aadhaar now — there is no longer a choice to make here.
  documentType: 'AADHAAR_CARD',
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
    documentType: details.documentType,
    documentOtherDescription: details.documentOtherDescription ?? '',
  };
}

/**
 * The fields from the property's paper "Student Registration Form" — father's
 * and mother's names, ID and college details, and permanent address. No
 * submit button and no terms checkbox here: those differ between a resident
 * filling this in for the first time and an admin correcting it afterward,
 * so the two screens that use this add their own — the same is true of the
 * Aadhaar photo itself, which each of those screens attaches on its own.
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
      <DateField label="Date of birth" value={values.dateOfBirth} onChange={(v) => onChange({ dateOfBirth: v })} />
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
      />
      <FormField
        label="Vehicle number"
        value={values.vehicleNumber}
        onChangeText={(v) => onChange({ vehicleNumber: v })}
        placeholder="Optional"
        autoCapitalize="characters"
      />
    </>
  );
}
