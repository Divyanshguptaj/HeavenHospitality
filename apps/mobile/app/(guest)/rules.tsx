import { StyleSheet, Text, View } from 'react-native';

import { PropertyScreen } from '../../src/components/PropertyScreen';
import { Card, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { layout, useTheme } from '../../src/theme';

/**
 * Rules — house rules a prospective resident should read before moving in.
 *
 * Numbered rather than bulleted so staff and residents can refer to "rule 3"
 * unambiguously in a conversation.
 */
export default function RulesScreen() {
  const theme = useTheme();

  return (
    <PropertyScreen>
      {(property) => (
        <>
          <PageHeading title="House rules" subtitle="What we ask of everyone who lives here." />

          {property.rules.length === 0 ? (
            <EmptyState message="House rules are not published yet." />
          ) : (
            <Card style={styles.list}>
              {property.rules.map((rule, index) => (
                <View
                  key={rule}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <View style={[styles.number, { backgroundColor: theme.primarySubtle }]}>
                    <Text style={[styles.numberLabel, { color: theme.primary }]}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.ruleText, { color: theme.textPrimary }]}>{rule}</Text>
                </View>
              ))}
            </Card>
          )}

          <Muted>
            Please ask the manager if anything here is unclear — it is easier to agree before you
            move in than afterwards.
          </Muted>
        </>
      )}
    </PropertyScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[4],
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: layout.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberLabel: { fontSize: layout.fontSize.xs, fontWeight: '600' },
  ruleText: {
    flex: 1,
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
});
