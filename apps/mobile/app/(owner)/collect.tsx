import { PAYMENT_METHOD_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOwnerPayments, useOwnerResidents, useRecordPayment } from '../../src/api/owner';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

type Method = 'CASH' | 'UPI' | 'BANK_TRANSFER';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Collecting a payment, from the phone.
 *
 * This is the screen an owner actually needs while standing in the corridor:
 * pick the person, confirm the amount, done. The receipt is issued by the
 * server in the same transaction.
 */
export default function CollectScreen() {
  const theme = useTheme();
  const residents = useOwnerResidents();
  const payments = useOwnerPayments();
  const recordPayment = useRecordPayment();

  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');

  const owing = (residents.data ?? []).filter((r) => r.outstandingPaise > 0);
  const chosen = (residents.data ?? []).find((r) => r.tenancyId === selected);

  function choose(tenancyId: string, outstandingPaise: number): void {
    setSelected(tenancyId);
    // Pre-fill what they owe — the common case is paying in full.
    setAmount(String(outstandingPaise / 100));
  }

  async function submit(): Promise<void> {
    if (chosen === undefined) return;
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      Alert.alert('Check the amount', 'Enter an amount greater than zero.');
      return;
    }

    try {
      const result = await recordPayment.mutateAsync({
        tenancyId: chosen.tenancyId,
        amountPaise: paise,
        method,
        paidAt: today(),
        ...(reference.trim() === '' ? {} : { reference: reference.trim() }),
      });

      Alert.alert(
        'Payment recorded',
        `${formatINR(paise, { withPaise: false })} from ${chosen.fullName}.\nReceipt ${result.receiptNumber ?? '—'}.`,
      );
      setSelected(null);
      setAmount('');
      setReference('');
    } catch (error) {
      Alert.alert(
        'Could not record',
        error instanceof ApiRequestError ? error.message : 'Please try again.',
      );
    }
  }

  return (
    <Screen onRefresh={() => void residents.refetch()} refreshing={residents.isRefetching}>
      <PageHeading
        title="Collect rent"
        subtitle="Record cash, UPI or a bank transfer. A receipt is issued automatically."
      />

      {residents.isPending ? (
        <LoadingState />
      ) : residents.error ? (
        <ErrorState
          message={
            residents.error instanceof ApiRequestError
              ? residents.error.message
              : 'Please try again.'
          }
          onRetry={() => void residents.refetch()}
        />
      ) : selected === null ? (
        <Card>
          <CardTitle>Who is paying?</CardTitle>
          {owing.length === 0 ? (
            <EmptyState message="Nobody has an outstanding balance right now." />
          ) : (
            owing.map((resident) => (
              <Pressable
                key={resident.tenancyId}
                onPress={() => choose(resident.tenancyId, resident.outstandingPaise)}
                accessibilityRole="button"
                accessibilityLabel={`Collect from ${resident.fullName}`}
                style={[styles.personRow, { borderColor: theme.border }]}
              >
                <View style={styles.personMain}>
                  <Text style={[styles.name, { color: theme.textPrimary }]}>
                    {resident.fullName}
                  </Text>
                  <Muted>
                    {resident.bed === null
                      ? 'No room'
                      : `Room ${resident.bed.roomNumber} · bed ${resident.bed.bedLabel}`}
                  </Muted>
                </View>
                <Text style={[styles.amount, { color: theme.danger }]}>
                  {formatINR(resident.outstandingPaise, { withPaise: false })}
                </Text>
              </Pressable>
            ))
          )}
        </Card>
      ) : (
        <Card>
          <View style={styles.headerRow}>
            <CardTitle>{chosen?.fullName ?? 'Resident'}</CardTitle>
            <Pressable onPress={() => setSelected(null)} accessibilityRole="button" hitSlop={12}>
              <Text style={{ color: theme.primary, fontWeight: '600' }}>Change</Text>
            </Pressable>
          </View>

          <Muted>Owes {formatINR(chosen?.outstandingPaise ?? 0, { withPaise: false })}</Muted>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Amount received (₹)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                },
              ]}
              accessibilityLabel="Amount received"
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>How did they pay?</Text>
            <View style={styles.methods}>
              {(['CASH', 'UPI', 'BANK_TRANSFER'] as const).map((value) => {
                const active = value === method;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setMethod(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.method,
                      { backgroundColor: active ? theme.primary : theme.surfaceSubtle },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? theme.textInverse : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: layout.fontSize.sm,
                      }}
                    >
                      {PAYMENT_METHOD_LABELS[value]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {method !== 'CASH' && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Reference / UTR (optional)
              </Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.textPrimary,
                  },
                ]}
                accessibilityLabel="Payment reference"
              />
            </View>
          )}

          <Button
            label={recordPayment.isPending ? 'Recording…' : 'Record payment'}
            onPress={() => void submit()}
          />

          <Muted>
            Applied to the oldest unpaid bill first. Anything extra is kept as credit against their
            next bill.
          </Muted>
        </Card>
      )}

      <Card>
        <CardTitle>Recent payments</CardTitle>
        {payments.isPending ? (
          <LoadingState />
        ) : (payments.data ?? []).length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          (payments.data ?? []).slice(0, 10).map((payment) => (
            <View key={payment.id} style={styles.personRow}>
              <View style={styles.personMain}>
                <Text style={[styles.name, { color: theme.textPrimary }]}>
                  {payment.residentName}
                </Text>
                <Muted>
                  {PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.receiptNumber !== null && ` · ${payment.receiptNumber}`}
                </Muted>
              </View>
              <View style={styles.right}>
                <Text style={[styles.amount, { color: theme.textPrimary }]}>
                  {formatINR(payment.amountPaise, { withPaise: false })}
                </Text>
                {payment.unallocatedPaise > 0 && (
                  <Badge
                    label={`${formatINR(payment.unallocatedPaise, { withPaise: false })} credit`}
                    tone="neutral"
                  />
                )}
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: layout.minTouchTarget,
  },
  personMain: { flex: 1, gap: layout.spacing[1] },
  right: { alignItems: 'flex-end', gap: layout.spacing[1] },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
  amount: { fontSize: layout.fontSize.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.lg,
    fontVariant: ['tabular-nums'],
  },
  methods: { flexDirection: 'row', gap: layout.spacing[2] },
  method: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: layout.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.spacing[3],
  },
});
