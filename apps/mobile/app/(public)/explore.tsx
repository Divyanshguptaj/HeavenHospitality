import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { usePublicHome } from '../../src/api/public';
import { Card, Muted, PageHeading, Screen } from '../../src/components/ui';
import { NavRow } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Explore — the way into everything that does not deserve a bottom tab.
 *
 * Facilities, the gallery, house rules, the story of the place, contact details
 * and directions are all things somebody reads once or twice while deciding.
 * Putting each behind its own tab would give the bar nine icons and make the
 * ones people actually use harder to hit.
 *
 * This screen is a menu, not a dashboard: it renders instantly and does not
 * block on a request. Counts come from the home query, which is already cached
 * by the time anyone gets here, and their absence changes nothing.
 */
export default function ExploreScreen() {
  const { data } = usePublicHome();

  const count = (value: number | undefined, noun: string): string | undefined =>
    value === undefined || value === 0 ? undefined : `${String(value)} ${noun}`;

  return (
    <Screen>
      <PageHeading title="Explore" subtitle="Everything else about living here." />

      <Card style={styles.group}>
        <NavRow
          icon="sparkles-outline"
          title="Facilities"
          subtitle={count(data?.facilityCount, 'included') ?? 'What comes with your stay'}
          onPress={() => router.push('/(public)/facilities')}
        />
        <Separator />
        <NavRow
          icon="images-outline"
          title="Gallery"
          subtitle={count(data?.galleryCount, 'photos') ?? 'See the rooms and common areas'}
          onPress={() => router.push('/(public)/gallery')}
        />
        <Separator />
        <NavRow
          icon="document-text-outline"
          title="House rules"
          subtitle="What we ask of everyone who lives here"
          onPress={() => router.push('/(public)/rules')}
        />
      </Card>

      <Card style={styles.group}>
        <NavRow
          icon="information-circle-outline"
          title={data === undefined ? 'About' : `About ${data.property.name}`}
          subtitle="Who we are and how moving in works"
          onPress={() => router.push('/(public)/about')}
        />
        <Separator />
        <NavRow
          icon="call-outline"
          title="Contact"
          subtitle="Call, WhatsApp or email us"
          onPress={() => router.push('/(public)/contact')}
        />
        <Separator />
        <NavRow
          icon="location-outline"
          title="Location"
          subtitle={
            data === undefined
              ? 'Address and directions'
              : `${data.property.location.address.locality}, ${data.property.location.address.city}`
          }
          onPress={() => router.push('/(public)/location')}
        />
      </Card>

      <Muted>
        Everything on these pages is maintained by the property, so it stays current without you
        updating the app.
      </Muted>
    </Screen>
  );
}

function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  // Rows carry their own padding, so the card supplies none.
  group: { gap: 0, padding: layout.spacing[1] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: layout.spacing[10] },
});
