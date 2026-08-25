import { formatINR } from '@heaven/money';
import { StyleSheet, Text, View } from 'react-native';

import { PropertyScreen } from '../../src/components/PropertyScreen';
import {
  Badge,
  Body,
  Card,
  CardTitle,
  DetailRow,
  Divider,
  EmptyState,
  Muted,
  PageHeading,
} from '../../src/components/ui';
import { layout, useTheme } from '../../src/theme';

/**
 * Rooms — sharing options, pricing and coarse availability.
 *
 * Deliberately shows a *count* of free beds per room type. It never shows which
 * room or which bed: precise availability is a map of where people live.
 */
export default function RoomsScreen() {
  const theme = useTheme();

  return (
    <PropertyScreen>
      {(property) => (
        <>
          <PageHeading
            title="Rooms"
            subtitle="Choose a sharing option. Rent is per person, per month."
          />

          {property.roomTypes.length === 0 ? (
            <EmptyState message="Room details are not published yet. Please check back soon." />
          ) : (
            property.roomTypes.map((roomType) => (
              <Card key={roomType.name}>
                <View style={styles.headerRow}>
                  <View style={styles.headerText}>
                    <CardTitle>{roomType.name}</CardTitle>
                    <Muted>
                      {roomType.capacity === 1
                        ? 'Private room'
                        : `${roomType.capacity} people sharing`}
                    </Muted>
                  </View>
                  <Badge
                    label={roomType.availableBeds === 0 ? 'Full' : `${roomType.availableBeds} free`}
                    tone={roomType.availableBeds === 0 ? 'warning' : 'success'}
                  />
                </View>

                {roomType.description !== null && <Body>{roomType.description}</Body>}

                <Divider />

                <DetailRow
                  label="Rent"
                  value={
                    <Text style={[styles.price, { color: theme.textPrimary }]}>
                      {formatINR(roomType.rentPaise, { withPaise: false })}
                      <Text style={[styles.priceUnit, { color: theme.textMuted }]}> / month</Text>
                    </Text>
                  }
                />
                <DetailRow
                  label="Type"
                  value={roomType.isAirConditioned ? 'Air conditioned' : 'Non-AC'}
                />

                {roomType.facilities.length > 0 && (
                  <View style={styles.amenities}>
                    {roomType.facilities.map((amenity: string) => (
                      <View
                        key={amenity}
                        style={[styles.chip, { backgroundColor: theme.surfaceSubtle }]}
                      >
                        <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>
                          {amenity}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            ))
          )}
        </>
      )}
    </PropertyScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  headerText: { flex: 1, gap: layout.spacing[1] },
  // Tabular figures keep prices aligned when scanning down a list.
  price: { fontSize: layout.fontSize.lg, fontWeight: '600', fontVariant: ['tabular-nums'] },
  priceUnit: { fontSize: layout.fontSize.sm, fontWeight: '400' },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[3] },
  chip: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[2],
  },
  chipLabel: { fontSize: layout.fontSize.sm },
});
