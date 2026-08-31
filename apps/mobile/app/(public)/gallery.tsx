import { useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { usePublicGallery } from '../../src/api/public';
import { Button, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { QueryScreen } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Gallery — photographs of the property, from object storage.
 *
 * The images are files in the configured store; only their metadata (URL,
 * caption, order, whether they are published) lives in PostgreSQL. Nothing here
 * is bundled with the app, so the owner replacing a photo replaces what people
 * see immediately.
 *
 * Paginated, because the endpoint is: a page at a time keeps the payload — and
 * the number of images decoding at once on a mid-range phone — bounded.
 */
export default function GalleryScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(1);
  const query = usePublicGallery(page);

  // Two columns, minus the screen padding and the gap between them.
  const tileWidth = (width - layout.spacing[5] * 2 - layout.spacing[3]) / 2;

  return (
    <QueryScreen query={query}>
      {(gallery) => (
        <>
          <PageHeading
            title="Gallery"
            subtitle={
              gallery.total === 0
                ? undefined
                : `${String(gallery.total)} photo${gallery.total === 1 ? '' : 's'} of the rooms and common areas.`
            }
          />

          {gallery.images.length === 0 ? (
            <EmptyState message="No photos have been published yet." />
          ) : (
            <View style={styles.grid}>
              {gallery.images.map((image) => (
                <View key={image.url} style={{ width: tileWidth, gap: layout.spacing[2] }}>
                  <Image
                    source={{ uri: image.url }}
                    style={[
                      styles.image,
                      { width: tileWidth, height: tileWidth, backgroundColor: theme.surfaceSubtle },
                    ]}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                    accessibilityLabel={image.caption ?? 'Photograph of the property'}
                  />
                  {image.caption !== null && (
                    <Text style={[styles.caption, { color: theme.textMuted }]} numberOfLines={2}>
                      {image.caption}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Explicit paging rather than infinite scroll. A gallery has an end,
              and a person looking at rooms wants to know they have seen it. */}
          {(gallery.hasMore || page > 1) && (
            <View style={styles.pager}>
              {page > 1 && (
                <Button
                  label="Previous"
                  variant="secondary"
                  onPress={() => {
                    setPage((current) => Math.max(1, current - 1));
                  }}
                />
              )}
              {gallery.hasMore && (
                <Button
                  label="More photos"
                  variant="secondary"
                  onPress={() => {
                    setPage((current) => current + 1);
                  }}
                />
              )}
            </View>
          )}

          <Muted>Photographs are of this property, not stock images.</Muted>
        </>
      )}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[3] },
  image: { borderRadius: layout.radius.lg },
  caption: { fontSize: layout.fontSize.xs },
  pager: { flexDirection: 'row', gap: layout.spacing[4] },
});
