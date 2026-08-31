import { Ionicons } from '@expo/vector-icons';
import { MEAL_LABELS } from '@heaven/contracts';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePublicHome } from '../../src/api/public';
import { Body, Button, Card, Muted } from '../../src/components/ui';
import {
  AvailabilityBadge,
  Chip,
  Hero,
  Price,
  QueryScreen,
  SectionHeader,
  facilityIcon,
  openExternal,
  whatsappUrl,
} from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Home — the first screen anybody sees, signed in or not.
 *
 * The order answers the questions in the order they are actually asked: what is
 * this place, can I get a bed, what does it cost, what is the food like, what is
 * included, and how do I reach someone. Every value on it comes from the API —
 * there is no property name, price or phone number written into this file.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const query = usePublicHome();

  return (
    <QueryScreen query={query} emptyMessage="This property is not published right now.">
      {(home) => {
        const { property, availability, todayMenu } = home;
        const enquiry = `Hi, I saw ${property.name} in the app and I would like to know about availability.`;

        return (
          <>
            <Hero
              imageUrl={property.heroImageUrl}
              title={property.name}
              subtitle={property.tagline}
            />

            {/* --- Can I get a bed, and what does it cost? ------------------ */}
            <Card>
              <View style={styles.availabilityRow}>
                <AvailabilityBadge availableBeds={availability.availableBeds} />
                {availability.startingRentPaise !== null && (
                  <View style={styles.fromPrice}>
                    <Muted>from</Muted>
                    <Price paise={availability.startingRentPaise} size="xl" />
                  </View>
                )}
              </View>

              <Body>
                {availability.availableBeds === 0
                  ? 'Every bed is taken at the moment. Get in touch and we will tell you as soon as one frees up.'
                  : `${String(availability.availableBeds)} of ${String(availability.totalBeds)} beds are free right now. Rent is per person, per month, and includes meals.`}
              </Body>

              <View style={styles.actions}>
                <Button label="Browse rooms" onPress={() => router.push('/(public)/rooms')} />
                <Button
                  label="Enquire"
                  variant="secondary"
                  accessibilityLabel={`Enquire about ${property.name}`}
                  onPress={() => {
                    // WhatsApp when the owner publishes one, the dialler
                    // otherwise. Most enquiries about a PG arrive on WhatsApp.
                    void openExternal(
                      property.contact.whatsappPhone === null
                        ? `tel:${property.contact.phone}`
                        : whatsappUrl(property.contact.whatsappPhone, enquiry),
                      'This device cannot open that app. The number is on the Contact page.',
                    );
                  }}
                />
              </View>
            </Card>

            {/* --- Highlights ---------------------------------------------- */}
            {property.highlights.length > 0 && (
              <View style={styles.highlights}>
                {property.highlights.map((highlight) => (
                  <View key={highlight} style={styles.highlight}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                    <Text style={[styles.highlightText, { color: theme.textSecondary }]}>
                      {highlight}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* --- Rooms preview ------------------------------------------- */}
            {home.roomTypePreview.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title="Rooms"
                  actionLabel="See all"
                  onAction={() => router.push('/(public)/rooms')}
                />
                {home.roomTypePreview.map((roomType) => (
                  <Card key={roomType.key}>
                    <View style={styles.roomRow}>
                      <View style={styles.roomText}>
                        <Text style={[styles.roomName, { color: theme.textPrimary }]}>
                          {roomType.name}
                        </Text>
                        <Muted>
                          {roomType.isAirConditioned ? 'Air conditioned' : 'Non-AC'}
                          {' · '}
                          {roomType.availableBeds === 0
                            ? 'full'
                            : `${String(roomType.availableBeds)} free`}
                        </Muted>
                      </View>
                      <Price paise={roomType.monthlyRentPaise} />
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {/* --- Today's food -------------------------------------------- */}
            <View style={styles.section}>
              <SectionHeader
                title="Today's menu"
                actionLabel="Full week"
                onAction={() => router.push('/(public)/menu')}
              />
              <Card>
                {todayMenu.meals.length === 0 ? (
                  <Muted>Today&apos;s menu has not been published yet.</Muted>
                ) : (
                  todayMenu.meals.map((meal, index) => (
                    <View
                      key={meal.mealType}
                      style={[
                        styles.meal,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: theme.border,
                          paddingTop: layout.spacing[4],
                        },
                      ]}
                    >
                      <View style={styles.mealHeader}>
                        <Text style={[styles.mealName, { color: theme.textMuted }]}>
                          {MEAL_LABELS[meal.mealType]}
                        </Text>
                        {meal.timing !== null && (
                          <Text style={[styles.mealTime, { color: theme.textMuted }]}>
                            {meal.timing.startsAt} – {meal.timing.endsAt}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.mealItems, { color: theme.textPrimary }]}>
                        {meal.items.join(' · ')}
                      </Text>
                      {meal.isSpecial && (
                        <Text style={[styles.special, { color: theme.primary }]}>
                          {meal.description ?? 'Special today'}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </Card>
            </View>

            {/* --- What's included ----------------------------------------- */}
            {home.facilityPreview.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title="What's included"
                  actionLabel={
                    home.facilityCount > home.facilityPreview.length
                      ? `All ${String(home.facilityCount)}`
                      : undefined
                  }
                  onAction={
                    home.facilityCount > home.facilityPreview.length
                      ? () => router.push('/(public)/facilities')
                      : undefined
                  }
                />
                <View style={styles.facilityGrid}>
                  {home.facilityPreview.map((facility) => (
                    <View
                      key={facility.name}
                      style={[styles.facility, { borderColor: theme.border }]}
                    >
                      <Ionicons
                        name={facilityIcon(facility.iconKey)}
                        size={18}
                        color={theme.primary}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={[styles.facilityLabel, { color: theme.textSecondary }]}>
                        {facility.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* --- Gallery preview ------------------------------------------ */}
            {home.galleryPreview.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title="Have a look around"
                  actionLabel={`All ${String(home.galleryCount)} photos`}
                  onAction={() => router.push('/(public)/gallery')}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryStrip}
                >
                  {home.galleryPreview.map((image) => (
                    <Image
                      key={image.url}
                      source={{ uri: image.url }}
                      style={[styles.galleryImage, { backgroundColor: theme.surfaceSubtle }]}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={image.caption ?? undefined}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* --- Where we are --------------------------------------------- */}
            <View style={styles.section}>
              <SectionHeader
                title="Where we are"
                actionLabel="Directions"
                onAction={() => router.push('/(public)/location')}
              />
              <Card>
                <Body>
                  {property.location.address.line}, {property.location.address.locality}
                </Body>
                <Body>
                  {property.location.address.city}, {property.location.address.state}{' '}
                  {property.location.address.pincode}
                </Body>
                <View style={styles.chips}>
                  <Chip label={property.location.address.locality} />
                  <Chip label={property.location.address.city} />
                </View>
              </Card>
            </View>

            <Muted>
              Prices, availability and the menu are kept up to date by the property. Pull down to
              refresh.
            </Muted>
          </>
        );
      }}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: layout.spacing[4] },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
    flexWrap: 'wrap',
  },
  fromPrice: { alignItems: 'flex-end' },
  actions: { flexDirection: 'row', gap: layout.spacing[4] },

  highlights: { gap: layout.spacing[3] },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[3] },
  highlightText: { flex: 1, fontSize: layout.fontSize.md },

  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  roomText: { flex: 1, gap: layout.spacing[1] },
  roomName: { fontSize: layout.fontSize.md, fontWeight: '600' },

  meal: { gap: layout.spacing[2] },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mealName: { fontSize: layout.fontSize.xs, fontWeight: '700', letterSpacing: 0.6 },
  mealTime: { fontSize: layout.fontSize.xs, fontVariant: ['tabular-nums'] },
  mealItems: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.snug,
  },
  special: { fontSize: layout.fontSize.xs, fontWeight: '600' },

  facilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[3] },
  facility: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacing[3],
    borderWidth: 1,
    borderRadius: layout.radius.full,
    paddingVertical: layout.spacing[3],
    paddingHorizontal: layout.spacing[4],
  },
  facilityLabel: { fontSize: layout.fontSize.sm },

  galleryStrip: { gap: layout.spacing[4], paddingRight: layout.spacing[4] },
  galleryImage: { width: 220, height: 145, borderRadius: layout.radius.lg },

  chips: { flexDirection: 'row', gap: layout.spacing[3], flexWrap: 'wrap' },
});
