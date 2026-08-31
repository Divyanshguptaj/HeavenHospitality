import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { usePublicRooms } from '../../src/api/public';
import { Body, Button, Card, Divider, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import {
  AvailabilityBadge,
  Chip,
  Price,
  QueryScreen,
} from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Rooms — the sharing options, their prices, and how many beds are free.
 *
 * Availability is deliberately a COUNT per room type. It never says which room
 * or which bed: precise availability is a map of where people live, and this
 * screen is served to anyone on the internet. The API enforces that; this screen
 * could not render more even if it tried.
 */
export default function RoomsScreen() {
  const theme = useTheme();
  const query = usePublicRooms();

  return (
    <QueryScreen query={query}>
      {({ roomTypes, availability }) => (
        <>
          <PageHeading
            title="Rooms"
            subtitle="Rent is per person, per month, and includes three meals a day."
          />

          {roomTypes.length === 0 ? (
            <EmptyState message="Room details have not been published yet. Please check back soon." />
          ) : (
            <>
              <Card>
                <View style={styles.summaryRow}>
                  <AvailabilityBadge availableBeds={availability.availableBeds} />
                  <Muted>
                    {String(availability.availableBeds)} of {String(availability.totalBeds)} beds
                  </Muted>
                </View>
              </Card>

              {roomTypes.map((roomType) => (
                <Card key={roomType.key}>
                  <View style={styles.header}>
                    <View style={styles.headerText}>
                      <Text style={[styles.name, { color: theme.textPrimary }]}>
                        {roomType.name}
                      </Text>
                      <Muted>
                        {roomType.capacity === 1
                          ? 'Private room'
                          : `${String(roomType.capacity)} people sharing`}
                      </Muted>
                    </View>
                    <AvailabilityBadge availableBeds={roomType.availableBeds} />
                  </View>

                  {roomType.description !== null && <Body>{roomType.description}</Body>}

                  <Divider />

                  <View style={styles.priceRow}>
                    <Price paise={roomType.monthlyRentPaise} size="xl" />
                    <Muted>
                      {roomType.isAirConditioned ? 'Air conditioned' : 'Non-AC'}
                      {' · '}
                      {String(roomType.totalBeds)} bed
                      {roomType.totalBeds === 1 ? '' : 's'} of this type
                    </Muted>
                  </View>

                  {roomType.facilities.length > 0 && (
                    <View style={styles.amenities}>
                      {roomType.facilities.map((amenity) => (
                        <Chip key={amenity} label={amenity} />
                      ))}
                    </View>
                  )}
                </Card>
              ))}
            </>
          )}

          <Card>
            <Body>
              Want to see a room before deciding? Visits are welcome — call ahead so someone is free
              to show you around.
            </Body>
            <Button
              label="Contact us"
              variant="secondary"
              onPress={() => router.push('/(public)/contact')}
            />
          </Card>

          <Muted>
            Availability changes as people move in and out. Pull down to refresh before you call.
          </Muted>
        </>
      )}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  headerText: { flex: 1, gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.lg, fontWeight: '600' },
  priceRow: { gap: layout.spacing[1] },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[3] },
});
