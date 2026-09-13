import { FACILITY_ICON_KEYS, type FacilityIconKey, type FacilityView } from '@heaven/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useCreateFacility,
  useDeleteFacility,
  useOwnerFacilities,
  useUpdateFacility,
} from '../../../src/api/owner';
import { facilityIcon } from '../../../src/components/publicUi';
import {
  Accordion,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

/** What comes with a stay — exactly what the public Facilities page reads. */
export default function FacilitiesScreen() {
  const facilities = useOwnerFacilities();

  return (
    <Screen onRefresh={() => void facilities.refetch()} refreshing={facilities.isRefetching}>
      <PageHeading title="Facilities" subtitle="What comes with a stay here." />

      {facilities.isPending ? (
        <LoadingState />
      ) : facilities.error ? (
        <ErrorState
          message={facilities.error instanceof ApiRequestError ? facilities.error.message : 'Please try again.'}
          onRetry={() => void facilities.refetch()}
        />
      ) : (
        <>
          {facilities.data.length === 0 ? (
            <Card>
              <EmptyState message="No facilities listed yet." />
            </Card>
          ) : (
            facilities.data.map((facility) => <FacilityRow key={facility.id} facility={facility} />)
          )}

          <AddFacilityForm />
        </>
      )}
    </Screen>
  );
}

function FacilityRow({ facility }: { readonly facility: FacilityView }) {
  const theme = useTheme();
  const updateFacility = useUpdateFacility();
  const deleteFacility = useDeleteFacility();

  const [name, setName] = useState(facility.name);
  const [description, setDescription] = useState(facility.description ?? '');
  const [iconKey, setIconKey] = useState<FacilityIconKey | null>(facility.iconKey);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setError(null);
    try {
      await updateFacility.mutateAsync({
        id: facility.id,
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
        iconKey,
      });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  function confirmDelete(): void {
    Alert.alert('Remove this facility?', `"${facility.name}" will no longer show on the public page.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteFacility.mutateAsync(facility.id).catch((caught: unknown) => {
            Alert.alert('Could not remove', caught instanceof ApiRequestError ? caught.message : 'Please try again.');
          });
        },
      },
    ]);
  }

  return (
    <Accordion
      title={facility.name}
      subtitle={facility.isActive ? undefined : 'Hidden from the public page'}
    >
      <FormField label="Name" value={name} onChangeText={setName} />
      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
        <View style={styles.iconRow}>
          {FACILITY_ICON_KEYS.map((key) => {
            const active = key === iconKey;
            return (
              <Pressable
                key={key}
                onPress={() => setIconKey(active ? null : key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={key}
                style={[
                  styles.iconChip,
                  { backgroundColor: active ? theme.primary : theme.surfaceSubtle, borderColor: theme.border },
                ]}
              >
                <Ionicons name={facilityIcon(key)} size={18} color={active ? theme.textInverse : theme.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Visible on the public page</Text>
        <Button
          label={facility.isActive ? 'Hide' : 'Show'}
          variant="secondary"
          onPress={() =>
            updateFacility.mutateAsync({ id: facility.id, isActive: !facility.isActive }).catch(() => undefined)
          }
        />
      </View>

      {error !== null && <Muted>{error}</Muted>}

      <View style={styles.actionsRow}>
        <Button label="Remove" variant="secondary" onPress={confirmDelete} />
        <Button label={updateFacility.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
      </View>
    </Accordion>
  );
}

function AddFacilityForm() {
  const theme = useTheme();
  const createFacility = useCreateFacility();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconKey, setIconKey] = useState<FacilityIconKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (name.trim() === '') return;
    setError(null);
    try {
      await createFacility.mutateAsync({
        name: name.trim(),
        ...(description.trim() === '' ? {} : { description: description.trim() }),
        ...(iconKey === null ? {} : { iconKey }),
      });
      setName('');
      setDescription('');
      setIconKey(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the facility.');
    }
  }

  return (
    <Card>
      <CardTitle>Add a facility</CardTitle>
      <FormField label="Name" value={name} onChangeText={setName} placeholder="Power backup" />
      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
        <View style={styles.iconRow}>
          {FACILITY_ICON_KEYS.map((key) => {
            const active = key === iconKey;
            return (
              <Pressable
                key={key}
                onPress={() => setIconKey(active ? null : key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={key}
                style={[
                  styles.iconChip,
                  { backgroundColor: active ? theme.primary : theme.surfaceSubtle, borderColor: theme.border },
                ]}
              >
                <Ionicons name={facilityIcon(key)} size={18} color={active ? theme.textInverse : theme.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {error !== null && <Muted>{error}</Muted>}

      <Button label={createFacility.isPending ? 'Adding…' : 'Add facility'} onPress={() => void submit()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  iconChip: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: layout.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2], justifyContent: 'flex-end' },
});
