import type { PublicGalleryView } from '@heaven/contracts';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { usePublicGallery } from '../../src/api/public';
import { Button, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { QueryScreen } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

const COLUMN_COUNT = 2;

type GalleryImage = PublicGalleryView['images'][number];

/** Natural width/height in pixels, keyed by image URL. */
type ImageSizes = Record<string, { readonly width: number; readonly height: number }>;

/**
 * Loads each image's real aspect ratio so the masonry columns below can size
 * tiles to match — without it every tile would default to a square, which is
 * exactly the uniform grid this is meant to replace.
 */
function useImageSizes(images: readonly GalleryImage[]): ImageSizes {
  const [sizes, setSizes] = useState<ImageSizes>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    for (const image of images) {
      if (requested.current.has(image.url)) continue;
      requested.current.add(image.url);
      Image.getSize(
        image.url,
        (width, height) => setSizes((current) => ({ ...current, [image.url]: { width, height } })),
        () => undefined,
      );
    }
  }, [images]);

  return sizes;
}

/** Shortest-column-first packing, like Pinterest's — each image goes to whichever column is currently shortest. */
function packColumns(
  images: readonly GalleryImage[],
  sizes: ImageSizes,
  columnWidth: number,
  gap: number,
): GalleryImage[][] {
  const columns: GalleryImage[][] = Array.from({ length: COLUMN_COUNT }, () => []);
  const columnHeights = new Array<number>(COLUMN_COUNT).fill(0);

  for (const image of images) {
    const size = sizes[image.url];
    const aspectRatio = size === undefined ? 1 : size.width / size.height;
    const tileHeight = columnWidth / aspectRatio;

    let shortest = 0;
    for (let i = 1; i < COLUMN_COUNT; i++) {
      if (columnHeights[i]! < columnHeights[shortest]!) shortest = i;
    }
    columns[shortest]!.push(image);
    columnHeights[shortest] = columnHeights[shortest]! + tileHeight + gap;
  }

  return columns;
}

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
  const sizes = useImageSizes(query.data?.images ?? []);

  const gap = layout.spacing[3];
  // Two columns, minus the screen padding and the gap between them.
  const columnWidth = (width - layout.spacing[5] * 2 - gap) / COLUMN_COUNT;
  const columns = query.data === undefined ? [] : packColumns(query.data.images, sizes, columnWidth, gap);

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
            <View style={[styles.grid, { gap }]}>
              {columns.map((column, columnIndex) => (
                <View key={columnIndex} style={[styles.column, { width: columnWidth, gap }]}>
                  {column.map((image) => {
                    const size = sizes[image.url];
                    const aspectRatio = size === undefined ? 1 : size.width / size.height;
                    return (
                      <View key={image.url} style={{ gap: layout.spacing[2] }}>
                        <Image
                          source={{ uri: image.url }}
                          style={[
                            styles.image,
                            { width: columnWidth, height: columnWidth / aspectRatio, backgroundColor: theme.surfaceSubtle },
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
                    );
                  })}
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
  grid: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  image: { borderRadius: layout.radius.lg },
  caption: { fontSize: layout.fontSize.xs },
  pager: { flexDirection: 'row', gap: layout.spacing[4] },
});
