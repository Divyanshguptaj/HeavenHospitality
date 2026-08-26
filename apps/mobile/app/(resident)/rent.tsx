import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  startPayment,
  useConfirmPayment,
  usePaymentDetails,
  useResidentElectricity,
  useResidentHome,
  useResidentInvoices,
  useResidentPayments,
} from '../../src/api/resident';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

type Tab = 'bill' | 'history' | 'electricity';

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'PAID') return 'success';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PARTIALLY_PAID') return 'warning';
  return 'neutral';
}

/**
 * Rent: what is owed, what it is made of, and how to pay it.
 *
 * The bill is shown as line items rather than one number — a resident should be
 * able to see exactly what the rent, electricity and any late fee are.
 */
export default function RentScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('bill');

  const home = useResidentHome();
  const invoices = useResidentInvoices();
  const payments = useResidentPayments();
  const electricity = useResidentElectricity();
  const paymentDetails = usePaymentDetails();
  const confirmPayment = useConfirmPayment();

  const [paying, setPaying] = useState(false);

  if (home.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your bill…" />
      </Screen>
    );
  }

  if (home.error) {
    return (
      <Screen>
        <ErrorState
          message={home.error instanceof ApiRequestError ? home.error.message : 'Please try again.'}
          onRetry={() => void home.refetch()}
        />
      </Screen>
    );
  }

  const invoice = home.data.currentInvoice;

  /**
   * The mock payment flow.
   *
   * Mirrors a real gateway exactly: the server creates the order and decides the
   * amount, the client "pays", and the server verifies a signed token before
   * recording anything. Swapping in Razorpay replaces the middle step only.
   */
  async function pay(): Promise<void> {
    if (invoice === null) return;
    setPaying(true);
    try {
      const order = await startPayment(invoice.id);

      Alert.alert(
        'Confirm payment',
        `Pay ${formatINR(order.amountPaise, { withPaise: false })} for ${invoice.number}?\n\nThis is a test payment — no real money moves.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
          {
            text: 'Pay now',
            onPress: () => {
              confirmPayment
                .mutateAsync({
                  invoiceId: invoice.id,
                  orderId: order.orderId,
                  mockToken: order.token,
                })
                .then((result) => {
                  Alert.alert(
                    'Payment received',
                    `Receipt ${result.receiptNumber} has been issued.`,
                  );
                })
                .catch((error: unknown) => {
                  Alert.alert(
                    'Payment failed',
                    error instanceof ApiRequestError
                      ? error.message
                      : 'Nothing has been charged. Please try again.',
                  );
                })
                .finally(() => setPaying(false));
            },
          },
        ],
      );
    } catch (error) {
      setPaying(false);
      Alert.alert(
        'Could not start payment',
        error instanceof ApiRequestError ? error.message : 'Please try again.',
      );
    }
  }

  const tabs: ReadonlyArray<{ id: Tab; label: string }> = [
    { id: 'bill', label: 'This month' },
    { id: 'history', label: 'History' },
    { id: 'electricity', label: 'Electricity' },
  ];

  return (
    <Screen onRefresh={() => void home.refetch()} refreshing={home.isRefetching}>
      <PageHeading title="Rent" subtitle="Your bill, payments and receipts." />

      <View style={styles.tabs}>
        {tabs.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => setTab(entry.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === entry.id }}
            style={[
              styles.tab,
              {
                borderBottomColor: tab === entry.id ? theme.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: tab === entry.id ? theme.primary : theme.textSecondary },
              ]}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'bill' &&
        (invoice === null ? (
          <Card>
            <EmptyState message="No bill has been issued yet. It will appear here at the start of the month." />
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.row}>
                <CardTitle>{invoice.number}</CardTitle>
                <Badge
                  label={INVOICE_STATUS_LABELS[invoice.status]}
                  tone={statusTone(invoice.status)}
                />
              </View>

              {invoice.items.map((item) => (
                <View key={item.id} style={styles.lineItem}>
                  <Text style={[styles.lineLabel, { color: theme.textSecondary }]}>
                    {item.description}
                  </Text>
                  <Text style={[styles.lineAmount, { color: theme.textPrimary }]}>
                    {formatINR(item.amountPaise, { withPaise: false })}
                  </Text>
                </View>
              ))}

              <Divider />

              <View style={styles.lineItem}>
                <Text style={[styles.totalLabel, { color: theme.textPrimary }]}>Total</Text>
                <Text style={[styles.totalAmount, { color: theme.textPrimary }]}>
                  {formatINR(invoice.totalPaise, { withPaise: false })}
                </Text>
              </View>

              {invoice.amountPaidPaise > 0 && (
                <View style={styles.lineItem}>
                  <Text style={[styles.lineLabel, { color: theme.success }]}>Already paid</Text>
                  <Text style={[styles.lineAmount, { color: theme.success }]}>
                    −{formatINR(invoice.amountPaidPaise, { withPaise: false })}
                  </Text>
                </View>
              )}

              <View style={styles.lineItem}>
                <Text style={[styles.totalLabel, { color: theme.textPrimary }]}>Payable now</Text>
                <Text
                  style={[
                    styles.totalAmount,
                    { color: invoice.outstandingPaise > 0 ? theme.danger : theme.success },
                  ]}
                >
                  {formatINR(invoice.outstandingPaise, { withPaise: false })}
                </Text>
              </View>

              <Muted>Due {invoice.dueDate}</Muted>

              {invoice.outstandingPaise > 0 && (
                <Button
                  label={paying || confirmPayment.isPending ? 'Processing…' : 'Pay now (test)'}
                  onPress={() => void pay()}
                />
              )}
            </Card>

            <Card>
              <CardTitle>Or pay directly</CardTitle>
              {paymentDetails.data === undefined ? (
                <Muted>Loading payment details…</Muted>
              ) : (
                <>
                  {paymentDetails.data.upiId !== null && (
                    <DetailRow label="UPI" value={paymentDetails.data.upiId} />
                  )}
                  {paymentDetails.data.bankAccountName !== null && (
                    <DetailRow label="Account" value={paymentDetails.data.bankAccountName} />
                  )}
                  {paymentDetails.data.bankAccountNumber !== null && (
                    <DetailRow label="A/C no." value={paymentDetails.data.bankAccountNumber} />
                  )}
                  {paymentDetails.data.bankIfsc !== null && (
                    <DetailRow label="IFSC" value={paymentDetails.data.bankIfsc} />
                  )}
                  {paymentDetails.data.bankName !== null && (
                    <DetailRow label="Bank" value={paymentDetails.data.bankName} />
                  )}
                  <Muted>
                    Tell the manager once you have paid by UPI or transfer — they will record it and
                    issue your receipt.
                  </Muted>
                </>
              )}
            </Card>
          </>
        ))}

      {tab === 'history' && (
        <>
          <Card>
            <CardTitle>Bills</CardTitle>
            {invoices.isPending ? (
              <LoadingState />
            ) : (invoices.data ?? []).length === 0 ? (
              <EmptyState message="No bills yet." />
            ) : (
              (invoices.data ?? []).map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View style={styles.historyMain}>
                    <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>
                      {entry.periodKey}
                    </Text>
                    <Muted>
                      {entry.number} · due {entry.dueDate}
                    </Muted>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.lineAmount, { color: theme.textPrimary }]}>
                      {formatINR(entry.totalPaise, { withPaise: false })}
                    </Text>
                    <Badge
                      label={INVOICE_STATUS_LABELS[entry.status]}
                      tone={statusTone(entry.status)}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card>
            <CardTitle>Payments and receipts</CardTitle>
            {payments.isPending ? (
              <LoadingState />
            ) : (payments.data ?? []).length === 0 ? (
              <EmptyState message="No payments recorded yet." />
            ) : (
              (payments.data ?? []).map((payment) => (
                <View key={payment.id} style={styles.historyRow}>
                  <View style={styles.historyMain}>
                    <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>
                      {formatINR(payment.amountPaise, { withPaise: false })}
                    </Text>
                    <Muted>
                      {PAYMENT_METHOD_LABELS[payment.method]}
                      {payment.paidAt !== null && ` · ${payment.paidAt.slice(0, 10)}`}
                    </Muted>
                  </View>
                  <View style={styles.historyRight}>
                    {payment.receiptNumber === null ? (
                      <Muted>No receipt</Muted>
                    ) : (
                      <Text style={[styles.receipt, { color: theme.textSecondary }]}>
                        {payment.receiptNumber}
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}

      {tab === 'electricity' && (
        <Card>
          <CardTitle>Your electricity</CardTitle>
          {electricity.isPending ? (
            <LoadingState />
          ) : (electricity.data ?? []).length === 0 ? (
            <EmptyState message="No meter readings recorded yet." />
          ) : (
            (electricity.data ?? []).map((entry) => (
              <View key={`${entry.periodKey}-${entry.roomNumber}`} style={styles.electricity}>
                <View style={styles.row}>
                  <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>
                    {entry.periodKey}
                  </Text>
                  <Text style={[styles.lineAmount, { color: theme.textPrimary }]}>
                    {formatINR(entry.sharePaise, { withPaise: false })}
                  </Text>
                </View>
                <Muted>
                  Room {entry.roomNumber} · {entry.previousReading} → {entry.currentReading} ={' '}
                  {entry.units} units @ {formatINR(entry.ratePaisePerUnit)}/unit
                </Muted>
                <Muted>
                  Your share is based on {entry.occupiedDays} day
                  {entry.occupiedDays === 1 ? '' : 's'} in the room that month.
                </Muted>
              </View>
            ))
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: layout.spacing[2] },
  tab: {
    paddingVertical: layout.spacing[3],
    paddingHorizontal: layout.spacing[4],
    borderBottomWidth: 2,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  tabLabel: { fontSize: layout.fontSize.md, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', gap: layout.spacing[4] },
  lineLabel: { flex: 1, fontSize: layout.fontSize.md },
  lineAmount: { fontSize: layout.fontSize.md, fontVariant: ['tabular-nums'] },
  totalLabel: { flex: 1, fontSize: layout.fontSize.md, fontWeight: '600' },
  totalAmount: {
    fontSize: layout.fontSize.lg,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
    paddingVertical: layout.spacing[2],
  },
  historyMain: { flex: 1, gap: layout.spacing[1] },
  historyRight: { alignItems: 'flex-end', gap: layout.spacing[2] },
  historyTitle: { fontSize: layout.fontSize.md, fontWeight: '600' },
  receipt: { fontSize: layout.fontSize.sm, fontVariant: ['tabular-nums'] },
  electricity: { gap: layout.spacing[1], paddingVertical: layout.spacing[2] },
});
