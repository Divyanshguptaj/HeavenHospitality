import type { PropertyPhotoView } from '@heaven/contracts';
import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { useCreatePhoto, useDeletePhoto, useOwnerGallery, useUpdatePhoto } from '../../../src/api/owner';
import { DocumentPhotoField } from '../../../src/components/DocumentPhotoField';
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
import { uploadToCloudinary } from '../../../src/lib/cloudinary';
import { layout } from '../../../src/theme';

/**
 * Photos guests see before they decide — taken or picked on the phone, same as
 * the admission form's document photo, and uploaded straight to Cloudinary.
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
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(uri: string): Promise<void> {
    setError(null);
    setLocalUri(uri);
    setUploadedUrl(null);
    setUploading(true);
    try {
      const url = await uploadToCloudinary(uri, {}, '/owner/gallery/uploads/cloudinary-signature');
      setUploadedUrl(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the photo.');
      setLocalUri(null);
    } finally {
      setUploading(false);
    }
  }

  async function submit(): Promise<void> {
    if (uploadedUrl === null || uploading || createPhoto.isPending) return;
    setError(null);
    try {
      await createPhoto.mutateAsync({
        url: uploadedUrl,
        ...(caption.trim() === '' ? {} : { caption: caption.trim() }),
      });
      setLocalUri(null);
      setUploadedUrl(null);
      setCaption('');
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the photo.');
    }
  }

  return (
    <Card>
      <CardTitle>Add a photo</CardTitle>
      <DocumentPhotoField photoUri={localUri} uploading={uploading} onPick={(uri) => void pick(uri)} />
      <FormField label="Caption" value={caption} onChangeText={setCaption} placeholder="Optional" />
      {error !== null && <Muted>{error}</Muted>}
      <Button
        label={
          uploading ? 'Uploading…' : createPhoto.isPending ? 'Adding…' : 'Add photo'
        }
        onPress={() => void submit()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 160, borderRadius: layout.radius.md },
  field: { gap: layout.spacing[2] },
  actionsRow: { flexDirection: 'row', gap: layout.spacing[2], justifyContent: 'flex-end' },
});
