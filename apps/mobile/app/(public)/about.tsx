import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { usePublicProperty } from '../../src/api/public';
import { Body, Button, Card, CardTitle, Muted, PageHeading } from '../../src/components/ui';
import { Hero, QueryScreen } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * About — the description, the highlights and what moving in involves.
 *
 * Every sentence on this screen is owner-written text stored in PostgreSQL. The
 * property could be renamed and re-described tonight and this screen would show
 * it tomorrow morning without anyone shipping a build.
 */
export default function AboutScreen() {
  const theme = useTheme();
  const query = usePublicProperty();

  return (
    <QueryScreen query={query}>
      {(property) => (
        <>
          <Hero
            imageUrl={property.heroImageUrl}
            title={property.name}
            subtitle={property.tagline}
          />

          <PageHeading
            title={`About ${property.name}`}
            subtitle={`${property.location.address.locality}, ${property.location.address.city}`}
          />

          {property.description !== null && (
            <Card>
              <Body>{property.description}</Body>
            </Card>
          )}

          {property.highlights.length > 0 && (
            <Card>
              <CardTitle>In short</CardTitle>
              {property.highlights.map((highlight) => (
                <View key={highlight} style={styles.highlight}>
                  <Ionicons name="checkmark-circle" size={17} color={theme.success} />
                  <Text style={[styles.highlightText, { color: theme.textSecondary }]}>
                    {highlight}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {property.checkInInfo !== null && (
            <Card>
              <CardTitle>Visiting and moving in</CardTitle>
              <Body>{property.checkInInfo}</Body>
            </Card>
          )}

          <Card>
            <CardTitle>Come and see it</CardTitle>
            <Body>
              The best way to decide is to visit. Call ahead so someone is free to show you the
              rooms rather than leaving you in the hall.
            </Body>
            <View style={styles.actions}>
              <Button label="Contact us" onPress={() => router.push('/(public)/contact')} />
              <Button
                label="Directions"
                variant="secondary"
                onPress={() => router.push('/(public)/location')}
              />
            </View>
          </Card>

          <Muted>
            Rooms, rent, the menu and everything else in this app is published by the property
            itself.
          </Muted>
        </>
      )}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  highlight: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[3] },
  highlightText: { flex: 1, fontSize: layout.fontSize.md },
  actions: { flexDirection: 'row', gap: layout.spacing[4] },
});
