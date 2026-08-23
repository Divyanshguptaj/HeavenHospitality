import { formatINR } from '@heaven/money';
import { StyleSheet, View } from 'react-native';

import { PropertyScreen } from '../../src/components/PropertyScreen';
import {
  Badge,
  Body,
  Card,
  CardTitle,
  DetailRow,
  Muted,
  PageHeading,
} from '../../src/components/ui';
import { layout } from '../../src/theme';

/**
 * Explore — the guest's first screen.
 *
 * Information hierarchy: what this place is, then whether they can get a bed,
 * then what it costs. Availability is coarse (a count) by design; see
 * docs/0004-authorization.md.
 */
export default function ExploreScreen() {
  return (
    <PropertyScreen>
      {(property) => (
        <>
          <PageHeading title={property.name} subtitle={property.tagline ?? undefined} />

          <Card>
            <View style={styles.availabilityRow}>
              <CardTitle>Availability</CardTitle>
              <Badge
                label={
                  property.availableBeds === 0
                    ? 'Fully occupied'
                    : `${property.availableBeds} bed${property.availableBeds === 1 ? '' : 's'} free`
                }
                tone={property.availableBeds === 0 ? 'warning' : 'success'}
              />
            </View>

            {property.availableBeds === 0 ? (
              <Body>
                Every bed is currently taken. Get in touch and we will let you know as soon as one
                frees up.
              </Body>
            ) : (
              <Body>
                Rooms are available now. See the Rooms tab for sharing options and pricing.
              </Body>
            )}

            {property.startingRentPaise !== null && (
              <DetailRow
                label="From"
                value={`${formatINR(property.startingRentPaise, { withPaise: false })} / month`}
              />
            )}
          </Card>

          {property.description !== null && (
            <Card>
              <CardTitle>About</CardTitle>
              <Body>{property.description}</Body>
            </Card>
          )}

          <Card>
            <CardTitle>Where we are</CardTitle>
            <Body>
              {property.address.line}, {property.address.locality}
            </Body>
            <Body>
              {property.address.city}, {property.address.state} {property.address.pincode}
            </Body>
            <Muted>Full directions and contact details are in the Contact tab.</Muted>
          </Card>
        </>
      )}
    </PropertyScreen>
  );
}

const styles = StyleSheet.create({
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
});
