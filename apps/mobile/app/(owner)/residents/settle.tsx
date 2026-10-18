import { formatINR } from '@heaven/money';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOwnerResident, useSettleBalance } from '../../../src/api/owner';
import {
  Button,
  Card,
  CardTitle,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

const rupees = (paise: number): string => formatINR(paise, { withPaise: false });

/** Not a real UUID — unique enough to tell one settle attempt from another. */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Group = 'RENT' | 'ELECTRICITY' | 'LATE_FEE' | 'DEPOSIT';

interface Option {
  readonly key: string;
  readonly invoiceId: string;
  readonly group: Group;
  readonly title: string;
  readonly maxPaise: number;
}

const GROUPS: ReadonlyArray<{ group: Group; title: string }> = [
  { group: 'RENT', title: 'Rent' },
  { group: 'ELECTRICITY', title: 'Electricity bill' },
  { group: 'LATE_FEE', title: 'Late fee' },
  { group: 'DEPOSIT', title: 'Deposit' },
];

/**
 * Settle up: forgive part of what a resident owes without recording a payment.
 *
 * Each bill is its own row under Rent, Electricity, Late fee or Deposit; a
 * ticked row starts at everything still owed and can be lowered.
 */
export default function SettleUpScreen() {
  const theme = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const resident = useOwnerResident(id);
  const settle = useSettleBalance();

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  const data = resident.data;

  if (resident.isPending) {
    return (
      <Screen center>
        <LoadingState />
      </Screen>
    );
  }
  if (data === undefined) {
    return (
      <Screen center>
        <ErrorState
          message={resident.error instanceof ApiRequestError ? resident.error.message : 'Please try again.'}
          onRetry={() => void resident.refetch()}
        />
      </Screen>
    );
  }

  const options: Option[] = [];
  for (const invoice of data.invoices) {
    if (invoice.status === 'CANCELLED') continue;
    const label = invoice.category === 'DEPOSIT' ? 'Security deposit' : invoice.periodKey;
    if (invoice.principalOutstandingPaise > 0) {
      options.push({
        key: `${invoice.id}:p`,
        invoiceId: invoice.id,
        group: invoice.category,
        title: label,
        maxPaise: invoice.principalOutstandingPaise,
      });
    }
    if (invoice.category === 'RENT' && invoice.lateFeePaise > 0) {
      options.push({
        key: `${invoice.id}:f`,
        invoiceId: invoice.id,
        group: 'LATE_FEE',
        title: invoice.periodKey,
        maxPaise: invoice.lateFeePaise,
      });
    }
  }

  const chosen = options
    .filter((option) => amounts[option.key] !== undefined)
    .map((option) => ({ option, paise: Math.round(Number(amounts[option.key]) * 100) }));
  const invalid = chosen.find(
    ({ option, paise }) => !Number.isFinite(paise) || paise <= 0 || paise > option.maxPaise,
  );
  const totalPaise = chosen.reduce((sum, entry) => sum + (entry.paise || 0), 0);

  function toggle(option: Option): void {
    setAmounts((current) => {
      const { [option.key]: existing, ...rest } = current;
      return existing === undefined ? { ...rest, [option.key]: String(option.maxPaise / 100) } : rest;
    });
    setIdempotencyKey(generateIdempotencyKey());
  }

  function lines(): Array<{ invoiceId: string; amountPaise: number; lateFeePaise: number }> {
    const byInvoice = new Map<string, { invoiceId: string; amountPaise: number; lateFeePaise: number }>();
    for (const { option, paise } of chosen) {
      const line = byInvoice.get(option.invoiceId) ?? {
        invoiceId: option.invoiceId,
        amountPaise: 0,
        lateFeePaise: 0,
      };
      if (option.group === 'LATE_FEE') line.lateFeePaise += paise;
      else line.amountPaise += paise;
      byInvoice.set(option.invoiceId, line);
    }
    return [...byInvoice.values()];
  }

  function review(): void {
    if (settle.isPending) return;
    if (chosen.length === 0) {
      Alert.alert('Nothing selected', 'Tick at least one item to settle.');
      return;
    }
    if (invalid !== undefined) {
      Alert.alert(
        'Check the amount',
        `Enter more than 0 and at most ${rupees(invalid.option.maxPaise)} for ${invalid.option.title}.`,
      );
      return;
    }
    if (note.trim().length < 3) {
      Alert.alert('Say what this is for', 'Add a short note. The resident will see it on their receipt.');
      return;
    }

    Alert.alert(
      'Do you really want to do this?',
      `${rupees(totalPaise)} of the dues of ${data?.fullName ?? 'this resident'} will be forgiven. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settle', style: 'destructive', onPress: () => void submit() },
      ],
    );
  }

  async function submit(): Promise<void> {
    try {
      const receipt = await settle.mutateAsync({
        tenancyId: id,
        idempotencyKey,
        note: note.trim(),
        lines: lines(),
      });
      setIdempotencyKey(generateIdempotencyKey());
      Alert.alert('Settled', `${rupees(receipt.totalPaise)} forgiven.\nReceipt ${receipt.number}.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (caught) {
      Alert.alert(
        'Could not settle',
        caught instanceof ApiRequestError ? caught.message : 'Please try again.',
      );
    }
  }

  return (
    <Screen onRefresh={() => void resident.refetch()} refreshing={resident.isRefetching}>
      <PageHeading
        title="Settle up"
        subtitle={`${data.fullName} owes ${rupees(data.outstandingPaise)}. Settling forgives money without recording a payment.`}
      />

      {options.length === 0 ? (
        <Card>
          <Muted>There is nothing to settle.</Muted>
        </Card>
      ) : (
        GROUPS.map(({ group, title }) => {
          const rows = options.filter((option) => option.group === group);
          if (rows.length === 0) return null;
          return (
            <Card key={group}>
              <CardTitle>{title}</CardTitle>
              {rows.map((option) => {
                const value = amounts[option.key];
                const checked = value !== undefined;
                return (
                  <View key={option.key} style={[styles.row, { borderColor: theme.border }]}>
                    <Pressable
                      onPress={() => toggle(option)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      style={styles.pick}
                    >
                      <Text style={[styles.name, { color: theme.textPrimary }]}>
                        {checked ? '☑ ' : '☐ '}
                        {option.title}
                      </Text>
                      <Muted>owes {rupees(option.maxPaise)}</Muted>
                    </Pressable>
                    {checked && (
                      <TextInput
                        value={value}
                        onChangeText={(text) => setAmounts((current) => ({ ...current, [option.key]: text }))}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Amount to settle for ${title} ${option.title}`}
                        style={[
                          styles.input,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.textPrimary,
                          },
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </Card>
          );
        })
      )}

      <Card>
        <FormField
          label="What is this for?"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Fixed the geyser"
          multiline
        />
        <Text style={[styles.name, { color: theme.textPrimary }]}>
          Total to settle: {rupees(totalPaise)}
        </Text>
        <Button label={settle.isPending ? 'Settling…' : 'Settle up'} onPress={review} />
        <Muted>It will not count as collected. The resident gets a receipt and a notification.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth, gap: layout.spacing[2], paddingBottom: layout.spacing[2] },
  pick: { gap: layout.spacing[1], minHeight: layout.minTouchTarget, justifyContent: 'center' },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.lg,
    fontVariant: ['tabular-nums'],
  },
});
