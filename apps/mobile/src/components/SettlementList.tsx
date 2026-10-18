import type { SettlementView } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Divider, Muted } from './ui';
import { layout, useTheme } from '../theme';

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

/** Settlement receipts, newest first; tap one to see what it covered and why. */
export function SettlementList({ settlements }: { readonly settlements: readonly SettlementView[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      {settlements.map((settlement, index) => {
        const expanded = open === settlement.id;
        return (
          <View key={settlement.id}>
            {index > 0 && <Divider />}
            <Pressable
              onPress={() => setOpen(expanded ? null : settlement.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={styles.row}
            >
              <View style={styles.main}>
                <Text style={[styles.title, { color: theme.textPrimary }]}>{settlement.number}</Text>
                <Muted>{settlement.issuedAt.slice(0, 10)}</Muted>
              </View>
              <Text style={[styles.amount, { color: theme.textPrimary }]}>
                {rupees(settlement.totalPaise)}
              </Text>
            </Pressable>
            {expanded && (
              <View style={styles.detail}>
                <Muted>{`For: ${settlement.note}`}</Muted>
                {settlement.lines.map((line, lineIndex) => (
                  <View key={lineIndex} style={styles.line}>
                    <Muted>{line.label}</Muted>
                    <Muted>{rupees(line.amountPaise + line.lateFeePaise)}</Muted>
                  </View>
                ))}
                {settlement.lateFeeForgivenPaise > 0 && (
                  <Muted>{`Includes ${rupees(settlement.lateFeeForgivenPaise)} of late fee.`}</Muted>
                )}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[3],
    minHeight: layout.minTouchTarget,
  },
  main: { flex: 1, gap: layout.spacing[1] },
  title: { fontSize: layout.fontSize.md, fontWeight: '600' },
  amount: { fontSize: layout.fontSize.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
  detail: { gap: layout.spacing[2], paddingBottom: layout.spacing[3] },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: layout.spacing[4] },
});
