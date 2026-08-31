import { StyleSheet, Text, View } from 'react-native';

import { usePublicRules } from '../../src/api/public';
import { Card, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { QueryScreen } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * House rules — from the database, numbered.
 *
 * Numbered rather than bulleted so staff and residents can refer to "rule 3"
 * unambiguously in a conversation, and split into a title and its detail because
 * a wall of prose is not read.
 */
export default function RulesScreen() {
  const theme = useTheme();
  const query = usePublicRules();

  return (
    <QueryScreen query={query}>
      {(rules) => (
        <>
          <PageHeading
            title="House rules"
            subtitle="What we ask of everyone who lives here. Worth reading before you move in."
          />

          {rules.length === 0 ? (
            <EmptyState message="House rules have not been published yet." />
          ) : (
            rules.map((rule, index) => (
              <Card key={rule.title}>
                <View style={styles.header}>
                  <View style={[styles.number, { backgroundColor: theme.primarySubtle }]}>
                    <Text style={[styles.numberLabel, { color: theme.primary }]}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.title, { color: theme.textPrimary }]}>{rule.title}</Text>
                </View>
                <Text style={[styles.description, { color: theme.textSecondary }]}>
                  {rule.description}
                </Text>
              </Card>
            ))
          )}

          <Muted>
            Ask the manager if anything here is unclear — it is much easier to agree before you move
            in than afterwards.
          </Muted>
        </>
      )}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[4] },
  number: {
    width: 26,
    height: 26,
    borderRadius: layout.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberLabel: { fontSize: layout.fontSize.xs, fontWeight: '700' },
  title: { flex: 1, fontSize: layout.fontSize.md, fontWeight: '600' },
  description: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
});
