import {
  REGISTRATION_DOCUMENT_TYPES,
  REGISTRATION_DOCUMENT_TYPE_LABELS,
  type RegistrationDetailsView,
  type RegistrationDocumentType,
} from '@heaven/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { layout, useTheme } from '../theme';
import { DateField } from './DateField';
import { FormField } from './ui';

/**
 * The admission form's fields, as plain strings for text inputs — every one
 * required except course/semester, mirroring the paper form the property
 * already used, where a blank field meant something was missed.
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
  documentType: null,
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
 * and mother's names, ID and college details, permanent address, and which
 * document this submission stands in for. No submit button and no terms
 * checkbox here: those differ between a resident filling this in for the
 * first time and an admin correcting it afterward, so the two screens that
 * use this add their own.
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
        autoCapitalize="characters"
      />

      <DocumentTypeField
        value={values.documentType}
        onSelect={(documentType) => onChange({ documentType })}
      />
      {values.documentType === 'OTHER' && (
        <FormField
          label="Describe the document"
          value={values.documentOtherDescription}
          onChangeText={(v) => onChange({ documentOtherDescription: v })}
          placeholder="e.g. Voter ID"
        />
      )}
    </>
  );
}

/** Which single document this submission is standing in for — a choice, not a checklist. */
function DocumentTypeField({
  value,
  onSelect,
}: {
  readonly value: RegistrationDocumentType | null;
  readonly onSelect: (type: RegistrationDocumentType) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Which document are you submitting?</Text>
      <View style={styles.pillRow}>
        {REGISTRATION_DOCUMENT_TYPES.map((type) => {
          const selected = value === type;
          return (
            <Pressable
              key={type}
              onPress={() => onSelect(type)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.pill,
                {
                  backgroundColor: selected ? theme.primary : theme.surfaceSubtle,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={[styles.pillLabel, { color: selected ? theme.textInverse : theme.textSecondary }]}>
                {REGISTRATION_DOCUMENT_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: layout.spacing[2] },
  fieldLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  pill: {
    borderWidth: 1,
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[2],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  pillLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
});
