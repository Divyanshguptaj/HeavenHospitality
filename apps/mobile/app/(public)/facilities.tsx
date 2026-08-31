import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { usePublicFacilities } from '../../src/api/public';
import { Card, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { QueryScreen, facilityIcon } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Facilities — what is included, from the database.
 *
 * The list is not written here and neither are the icons' identities: the server
 * sends a semantic key ("wifi") and `facilityIcon` decides what it looks like.
 * Adding a facility is an owner action, not a release.
 */
export default function FacilitiesScreen() {
  const theme = useTheme();
  const query = usePublicFacilities();

  return (
    <QueryScreen query={query}>
      {(facilities) => (
        <>
          <PageHeading
            title="Facilities"
            subtitle="Everything below is included in the rent unless noted."
          />

          {facilities.length === 0 ? (
            <EmptyState message="Facility details have not been published yet." />
          ) : (
            <Card style={styles.list}>
              {facilities.map((facility, index) => (
                <View
                  key={facility.name}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: theme.primarySubtle }]}>
                    <Ionicons
                      name={facilityIcon(facility.iconKey)}
                      size={18}
                      color={theme.primary}
                      // Decorative: the adjacent text already names the
                      // facility, so announcing the icon too is just noise.
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </View>
                  <View style={styles.text}>
                    <Text style={[styles.name, { color: theme.textPrimary }]}>{facility.name}</Text>
                    {facility.description !== null && (
                      <Text style={[styles.description, { color: theme.textSecondary }]}>
                        {facility.description}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Muted>
            Electricity is metered per room and billed separately at actual usage — never as a flat
            charge.
          </Muted>
        </>
      )}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[5],
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: layout.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.md, fontWeight: '500' },
  description: {
    fontSize: layout.fontSize.sm,
    lineHeight: layout.fontSize.sm * layout.lineHeight.normal,
  },
});
