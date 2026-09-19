import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useOwnerSettings, useUpdatePropertyProfile } from '../../../src/api/owner';
import {
  Button,
  Card,
  CardTitle,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

/**
 * About, contact and location — exactly the fields the public About, Contact
 * and Location pages read, edited here instead of by hand in the database.
 */
export default function PropertyInfoScreen() {
  const settings = useOwnerSettings();
  const updateProfile = useUpdatePropertyProfile();

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isPubliclyListed, setIsPubliclyListed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const data = settings.data;

  useEffect(() => {
    if (data === undefined) return;
    setName(data.property.name);
    setTagline(data.property.tagline ?? '');
    setDescription(data.property.description ?? '');
    setAddressLine(data.property.addressLine);
    setLocality(data.property.locality);
    setCity(data.property.city);
    setState(data.property.state);
    setPincode(data.property.pincode);
    setContactPhone(data.property.contactPhone);
    setContactEmail(data.property.contactEmail ?? '');
    setIsPubliclyListed(data.property.isPubliclyListed);
  }, [data]);

  if (settings.isPending) {
    return (
      <Screen center>
        <LoadingState label="Loading the property profile…" />
      </Screen>
    );
  }

  if (settings.error || data === undefined) {
    return (
      <Screen center>
        <ErrorState
          message={settings.error instanceof ApiRequestError ? settings.error.message : 'Please try again.'}
          onRetry={() => void settings.refetch()}
        />
      </Screen>
    );
  }

  async function save(): Promise<void> {
    setError(null);
    try {
      await updateProfile.mutateAsync({
        name: name.trim(),
        tagline: tagline.trim() === '' ? null : tagline.trim(),
        description: description.trim() === '' ? null : description.trim(),
        addressLine: addressLine.trim(),
        locality: locality.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        isPubliclyListed,
      });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save changes.');
    }
  }

  return (
    <Screen>
      <PageHeading title="Property profile" subtitle="About, contact and location." />

      <Card>
        <CardTitle>About</CardTitle>
        <FormField label="Name" value={name} onChangeText={setName} />
        <FormField label="Tagline" value={tagline} onChangeText={setTagline} placeholder="A short line under the name" />
        <FormField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="The longer story guests read on About"
        />
      </Card>

      <Card>
        <CardTitle>Contact</CardTitle>
        <FormField label="Phone" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
        <FormField label="Email" value={contactEmail} onChangeText={setContactEmail} placeholder="Optional" />
      </Card>

      <Card>
        <CardTitle>Location</CardTitle>
        <FormField label="Address" value={addressLine} onChangeText={setAddressLine} />
        <FormField label="Locality" value={locality} onChangeText={setLocality} />
        <FormField label="City" value={city} onChangeText={setCity} />
        <FormField label="State" value={state} onChangeText={setState} />
        <FormField label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
      </Card>

      <Card>
        <CardTitle>Visibility</CardTitle>
        <YesNoToggle
          label="Publicly listed"
          value={isPubliclyListed}
          onChange={setIsPubliclyListed}
        />
        <Muted>
          Unlisting hides this property from the public app entirely, including for guests who
          already have the link.
        </Muted>
      </Card>

      {error !== null && <Muted>{error}</Muted>}

      <Button label={updateProfile.isPending ? 'Saving…' : 'Save changes'} onPress={() => void save()} />
    </Screen>
  );
}

function YesNoToggle({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.chipsRow}>
        {[
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ].map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.chip, { backgroundColor: active ? theme.primary : theme.surfaceSubtle }]}
            >
              <Text style={{ color: active ? theme.textInverse : theme.textSecondary, fontWeight: '600' }}>
                {option.label}
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
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', gap: layout.spacing[2] },
  chip: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[5],
    paddingVertical: layout.spacing[3],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
});
