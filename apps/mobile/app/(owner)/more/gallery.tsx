import type { PropertyPhotoView } from '@heaven/contracts';
import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { useCreatePhoto, useDeletePhoto, useOwnerGallery, useUpdatePhoto } from '../../../src/api/owner';
import {
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
import { layout } from '../../../src/theme';

/**
 * Photos guests see before they decide — added by URL, not upload.
 *
 * There is no object-storage integration in this project yet (the API's own
 * feature flags report it disabled), so a photo here is a link to an image
 * hosted elsewhere. That already covers the real dev workflow: PropertyPhoto
 * itself is built to take a plain external URL, not only a stored file.
 */
export default function GalleryScreen() {
  const gallery = useOwnerGallery();

  return (
    <Screen onRefresh={() => void gallery.refetch()} refreshing={gallery.isRefetching}>
      <PageHeading title="Gallery" subtitle="Photos guests see before they decide." />

      {gallery.isPending ? (
        <LoadingState />
      ) : gallery.error ? (
        <ErrorState
          message={gallery.error instanceof ApiRequestError ? gallery.error.message : 'Please try again.'}
          onRetry={() => void gallery.refetch()}
        />
      ) : (
        <>
          {gallery.data.length === 0 ? (
            <Card>
              <EmptyState message="No photos added yet." />
            </Card>
          ) : (
            gallery.data.map((photo) => <PhotoRow key={photo.id} photo={photo} />)
          )}

          <AddPhotoForm />
        </>
      )}
    </Screen>
  );
}

function PhotoRow({ photo }: { readonly photo: PropertyPhotoView }) {
  const updatePhoto = useUpdatePhoto();
  const deletePhoto = useDeletePhoto();
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setError(null);
    try {
      await updatePhoto.mutateAsync({ id: photo.id, caption: caption.trim() === '' ? null : caption.trim() });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  function confirmDelete(): void {
    Alert.alert('Remove this photo?', 'It will no longer show on the public gallery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deletePhoto.mutateAsync(photo.id).catch((caught: unknown) => {
            Alert.alert('Could not remove', caught instanceof ApiRequestError ? caught.message : 'Please try again.');
          });
        },
      },
    ]);
  }

  return (
    <Card>
      <Image source={{ uri: photo.url }} style={styles.thumb} resizeMode="cover" />
      <FormField label="Caption" value={caption} onChangeText={setCaption} placeholder="Optional" />

      <View style={styles.field}>
        <Muted>Visible on the public page</Muted>
        <Button
          label={photo.isActive ? 'Hide' : 'Show'}
          variant="secondary"
          onPress={() => updatePhoto.mutateAsync({ id: photo.id, isActive: !photo.isActive }).catch(() => undefined)}
        />
      </View>

      {error !== null && <Muted>{error}</Muted>}

      <View style={styles.actionsRow}>
        <Button label="Remove" variant="secondary" onPress={confirmDelete} />
        <Button label={updatePhoto.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function AddPhotoForm() {
  const createPhoto = useCreatePhoto();
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (url.trim() === '') return;
    setError(null);
    try {
      await createPhoto.mutateAsync({
        url: url.trim(),
        ...(caption.trim() === '' ? {} : { caption: caption.trim() }),
      });
      setUrl('');
      setCaption('');
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the photo.');
    }
  }

  return (
    <Card>
      <CardTitle>Add a photo</CardTitle>
      <FormField label="Image URL" value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" />
      <FormField label="Caption" value={caption} onChangeText={setCaption} placeholder="Optional" />
      {error !== null && <Muted>{error}</Muted>}
      <Button label={createPhoto.isPending ? 'Adding…' : 'Add photo'} onPress={() => void submit()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 160, borderRadius: layout.radius.md },
  field: { gap: layout.spacing[2] },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2], justifyContent: 'flex-end' },
});
