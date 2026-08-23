import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PropertyScreen } from '../../src/components/PropertyScreen';
import { Card, EmptyState, PageHeading } from '../../src/components/ui';
import { layout, useTheme } from '../../src/theme';

/**
 * Maps the server's icon hint to an Ionicons name.
 *
 * The server stores a semantic hint ("wifi"), never presentation markup, so the
 * client owns the icon set and an unknown hint degrades to a neutral default
 * rather than rendering nothing.
 */
const ICONS: Readonly<Record<string, keyof typeof Ionicons.glyphMap>> = {
  wifi: 'wifi-outline',
  utensils: 'restaurant-outline',
  shirt: 'shirt-outline',
  sparkles: 'sparkles-outline',
  zap: 'flash-outline',
  shield: 'shield-checkmark-outline',
  droplet: 'water-outline',
  book: 'book-outline',
};

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = 'checkmark-circle-outline';

export default function FacilitiesScreen() {
  const theme = useTheme();

  return (
    <PropertyScreen>
      {(property) => (
        <>
          <PageHeading title="Facilities" subtitle="What is included in your stay." />

          {property.facilities.length === 0 ? (
            <EmptyState message="Facility details are not published yet." />
          ) : (
            <Card style={styles.list}>
              {property.facilities.map((facility, index) => (
                <View
                  key={facility.label}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      facility.icon !== null
                        ? (ICONS[facility.icon] ?? FALLBACK_ICON)
                        : FALLBACK_ICON
                    }
                    size={20}
                    color={theme.primary}
                    // Decorative: the adjacent text already names the facility,
                    // so announcing the icon too would just be noise.
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <Text style={[styles.label, { color: theme.textPrimary }]}>{facility.label}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </PropertyScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[4],
  },
  label: {
    flex: 1,
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
});
