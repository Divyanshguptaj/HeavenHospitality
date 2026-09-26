import { INVOICE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  useOwnerPayments,
  useOwnerResident,
  useOwnerResidents,
  useRecordPayment,
} from '../../src/api/owner';
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
 * Not a real UUID — just unique enough to tell one collection attempt from
 * another, which is all the server's idempotency check needs.
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  // Which bills this payment covers, and the rupee amount typed for each. A bill
  // is "covered" when it has an entry; the amount starts at what it still owes.
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  // Stable for the whole attempt — a slow request that times out and gets
  // retried, or a double-tap, carries the SAME key, so the server recognises
  // the repeat and returns the original payment instead of a second one. Only
  // rotated once a payment actually succeeds, never on failure.
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  const owing = (residents.data ?? []).filter((r) => r.outstandingPaise > 0);
  const chosen = (residents.data ?? []).find((r) => r.tenancyId === selected);

  const detail = useOwnerResident(selected ?? '');
  const unpaid = (detail.data?.invoices ?? []).filter(
    (invoice) => invoice.outstandingPaise > 0 && invoice.status !== 'CANCELLED',
  );
  const allocations = unpaid
    .filter((invoice) => amounts[invoice.id] !== undefined)
    .map((invoice) => ({
      invoice,
      amountPaise: Math.round(Number(amounts[invoice.id]) * 100),
    }));
  const invalid = allocations.find(
    ({ invoice, amountPaise }) =>
      !Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise > invoice.outstandingPaise,
  );
  const paise = allocations.reduce((sum, entry) => sum + (entry.amountPaise || 0), 0);

  function choose(tenancyId: string): void {
    setSelected(tenancyId);
    setAmounts({});
    setIdempotencyKey(generateIdempotencyKey());
  }

  function toggle(invoiceId: string, outstandingPaise: number): void {
    setAmounts((current) => {
      const { [invoiceId]: existing, ...rest } = current;
      return existing === undefined ? { ...rest, [invoiceId]: String(outstandingPaise / 100) } : rest;
    });
    setIdempotencyKey(generateIdempotencyKey());
  }

  function setAmount(invoiceId: string, value: string): void {
    setAmounts((current) => ({ ...current, [invoiceId]: value }));
  }

  async function submit(): Promise<void> {
    if (chosen === undefined || recordPayment.isPending) return;
    if (allocations.length === 0) {
      Alert.alert('Nothing selected', 'Tick at least one bill this payment covers.');
      return;
    }
    if (invalid !== undefined) {
      Alert.alert(
        'Check the amount',
        `${INVOICE_CATEGORY_LABELS[invalid.invoice.category]}: enter more than 0 and at most ${formatINR(invalid.invoice.outstandingPaise, { withPaise: false })}.`,
      );
      return;
    }

    try {
      const result = await recordPayment.mutateAsync({
        tenancyId: chosen.tenancyId,
        allocations: allocations.map(({ invoice, amountPaise }) => ({
          invoiceId: invoice.id,
          amountPaise,
        })),
        method,
        paidAt: today(),
        idempotencyKey,
        ...(reference.trim() === '' ? {} : { reference: reference.trim() }),
      });

      Alert.alert(
        'Payment recorded',
        `${formatINR(paise, { withPaise: false })} from ${chosen.fullName}.\nReceipt ${result.receiptNumber ?? '—'}.`,
      );
      setSelected(null);
      setAmounts({});
      setReference('');
      setIdempotencyKey(generateIdempotencyKey());
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
                onPress={() => choose(resident.tenancyId)}
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
            <Text style={[styles.label, { color: theme.textSecondary }]}>What is being paid?</Text>
            {detail.isPending ? (
              <LoadingState />
            ) : unpaid.length === 0 ? (
              <Muted>No unpaid bills.</Muted>
            ) : (
              unpaid.map((invoice) => {
                const value = amounts[invoice.id];
                const checked = value !== undefined;
                return (
                  <View key={invoice.id} style={[styles.billRow, { borderColor: theme.border }]}>
                    <Pressable
                      onPress={() => toggle(invoice.id, invoice.outstandingPaise)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      style={styles.personRow}
                    >
                      <View style={styles.personMain}>
                        <Text style={[styles.name, { color: theme.textPrimary }]}>
                          {checked ? '☑ ' : '☐ '}
                          {INVOICE_CATEGORY_LABELS[invoice.category]}
                        </Text>
                        <Muted>
                          {invoice.category === 'DEPOSIT' ? 'One-time' : invoice.periodKey} · owes{' '}
                          {formatINR(invoice.outstandingPaise, { withPaise: false })}
                        </Muted>
                      </View>
                    </Pressable>
                    {checked && (
                      <TextInput
                        value={value}
                        onChangeText={(text) => setAmount(invoice.id, text)}
                        keyboardType="decimal-pad"
                        style={[
                          styles.input,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.textPrimary,
                          },
                        ]}
                        accessibilityLabel={`Amount paid for ${INVOICE_CATEGORY_LABELS[invoice.category]}`}
                      />
                    )}
                  </View>
                );
              })
            )}
            <Text style={[styles.name, { color: theme.textPrimary }]}>
              Total received: {formatINR(paise, { withPaise: false })}
            </Text>
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

          <Muted>Only the ticked bills are marked paid; the rest stay outstanding.</Muted>
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
  billRow: { borderBottomWidth: StyleSheet.hairlineWidth, gap: layout.spacing[2] },
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
