import { INVOICE_CATEGORY_LABELS, INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';

import {
  startPayment,
  useConfirmPayment,
  usePaymentDetails,
  useResidentElectricity,
  useResidentHome,
  useResidentInvoices,
  useResidentPayments,
  type PaymentOrder,
} from '../../src/api/resident';
import { useAuthStore } from '../../src/auth/authStore';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  CheckboxRow,
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
/**
 * Opens Razorpay Checkout, dynamically. This native module only exists in a
 * dev client rebuilt after it was added, and importing it eagerly would crash
 * the whole rent screen for anyone on an older build — the same reasoning as
 * the Aadhaar photo picker's own guarded import (see documentPhotoPicker.ts).
 * Metro "guards" a module whose top-level code throws, so a missing native
 * module shows up as an import with no usable `default`, not a catchable
 * exception.
 */
async function openRazorpayCheckout(
  order: PaymentOrder,
  invoiceNumber: string,
  prefill: { name: string; email: string | null; contact: string | null },
): Promise<{ orderId: string; providerPaymentId: string; signature: string } | null> {
  let RazorpayCheckout: (typeof import('react-native-razorpay'))['default'];
  try {
    const module = await import('react-native-razorpay');
    if (typeof module.default?.open !== 'function') throw new Error('native module missing');
    RazorpayCheckout = module.default;
  } catch {
    Alert.alert(
      'Update needed',
      'Online payment needs a newer version of the app. Ask the developer to rebuild it.',
    );
    return null;
  }

  try {
    const result = await RazorpayCheckout.open({
      key: order.keyId as string,
      amount: order.amountPaise,
      currency: order.currency,
      order_id: order.orderId,
      name: 'The Heaven Hospitality',
      description: invoiceNumber,
      prefill: {
        name: prefill.name,
        ...(prefill.email === null ? {} : { email: prefill.email }),
        ...(prefill.contact === null ? {} : { contact: prefill.contact }),
      },
    });
    return {
      orderId: result.razorpay_order_id,
      providerPaymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature,
    };
  } catch (error) {
    // A cancelled checkout arrives here too, not just a real failure — Razorpay
    // reports both the same way, so this is never treated as an error toast.
    const description =
      error !== null && typeof error === 'object' && 'description' in error
        ? String((error as { description?: unknown }).description)
        : null;
    if (description !== null) Alert.alert('Payment not completed', description);
    return null;
  }
}

export default function RentScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<Tab>('bill');

  const home = useResidentHome();
  const invoices = useResidentInvoices();
  const payments = useResidentPayments();
  const electricity = useResidentElectricity();
  const paymentDetails = usePaymentDetails();
  const confirmPayment = useConfirmPayment();

  const [paying, setPaying] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  if (home.isPending) {
    return (
      <Screen center>
        <LoadingState label="Loading your bill…" />
      </Screen>
    );
  }

  if (home.data === undefined) {
    // A background refetch (after a mutation, say) can fail while stale data
    // from before is still good to show — that case falls through below
    // instead of replacing a working screen with an error.
    return (
      <Screen center>
        <ErrorState
          message={home.error instanceof ApiRequestError ? home.error.message : 'Please try again.'}
          onRetry={() => void home.refetch()}
        />
      </Screen>
    );
  }

  const invoice = home.data.currentInvoice;

  /**
   * The server creates the order and decides the amount; the client only ever
   * hands back what the checkout (real or mock) produced, and the server
   * verifies that before recording anything. See docs/0007-payments.md.
   */
  async function pay(invoiceIds: string[]): Promise<void> {
    setPaying(true);

    async function settle(confirmation: { orderId: string; providerPaymentId: string; signature: string }) {
      try {
        const result = await confirmPayment.mutateAsync({ invoiceIds, ...confirmation });
        Alert.alert(
          'Payment received',
          `Receipts ${result.receiptNumbers.join(', ')} have been issued.`,
        );
      } catch (error) {
        Alert.alert(
          'Payment failed',
          error instanceof ApiRequestError ? error.message : 'Nothing has been charged. Please try again.',
        );
      }
    }

    try {
      const order = await startPayment(invoiceIds);

      if (order.keyId !== null) {
        // Use the first invoice's number for the Razorpay description when
        // multiple invoices are selected; the receipt will list all of them.
        const firstInvoice = (invoices.data ?? []).find((inv) => invoiceIds[0] === inv.id);
        const description = firstInvoice?.number ?? invoiceIds[0] ?? '';
        const confirmation = await openRazorpayCheckout(order, description, {
          name: user?.fullName ?? '',
          email: user?.email ?? null,
          contact: user?.phone ?? null,
        });
        if (confirmation !== null) await settle(confirmation);
        setPaying(false);
        return;
      }

      // The mock provider: no real checkout exists, so this stands in for one.
      const mock = order.mock;
      if (mock === null) {
        setPaying(false);
        Alert.alert('Could not start payment', 'Please try again.');
        return;
      }

      Alert.alert(
        'Confirm payment',
        `Pay ${formatINR(order.amountPaise, { withPaise: false })} for ${invoiceIds.length} invoice${invoiceIds.length === 1 ? '' : 's'}?\n\nThis is a test payment — no real money moves.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
          {
            text: 'Pay now',
            onPress: () => {
              void settle({ orderId: order.orderId, ...mock }).finally(() => setPaying(false));
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
                  label={paying || confirmPayment.isPending ? 'Processing…' : 'Pay now'}
                  onPress={() => {
                    // Pre-select the current invoice when the sheet opens
                    setSelectedInvoiceIds(new Set([invoice.id]));
                    setPayModalVisible(true);
                  }}
                />
              )}
            </Card>

            {/* Payment selection bottom sheet modal */}
            <Modal
              visible={payModalVisible}
              transparent
              animationType="slide"
              onRequestClose={() => setPayModalVisible(false)}
            >
              <View style={styles.payModal}>
                <TouchableWithoutFeedback onPress={() => setPayModalVisible(false)}>
                  <View style={styles.payBackdrop} />
                </TouchableWithoutFeedback>

                <View style={[styles.paySheet, { backgroundColor: theme.surface }]}>
                <Text style={[styles.paySheetTitle, { color: theme.textPrimary }]}>
                  Select what to pay
                </Text>

                {/* List of all outstanding invoices across all periods */}
                {(invoices.data ?? [])
                  .filter((inv) => inv.outstandingPaise > 0)
                  .map((inv) => {
                    const checked = selectedInvoiceIds.has(inv.id);
                    return (
                      <View key={inv.id} style={styles.payInvoiceRow}>
                        <CheckboxRow
                          label=""
                          checked={checked}
                          onToggle={() => {
                            setSelectedInvoiceIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(inv.id)) {
                                next.delete(inv.id);
                              } else {
                                next.add(inv.id);
                              }
                              return next;
                            });
                          }}
                        />
                        <Pressable
                          style={styles.payInvoiceInfo}
                          onPress={() => {
                            setSelectedInvoiceIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(inv.id)) {
                                next.delete(inv.id);
                              } else {
                                next.add(inv.id);
                              }
                              return next;
                            });
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={`${INVOICE_CATEGORY_LABELS[inv.category]} ${inv.periodKey}`}
                        >
                          <Text style={[styles.payInvoiceLabel, { color: theme.textPrimary }]}>
                            {INVOICE_CATEGORY_LABELS[inv.category]}
                          </Text>
                          <Muted>{inv.periodKey}</Muted>
                        </Pressable>
                        <Text style={[styles.payInvoiceAmount, { color: theme.textPrimary }]}>
                          {formatINR(inv.outstandingPaise, { withPaise: false })}
                        </Text>
                      </View>
                    );
                  })}

                <Divider />

                {/* Live total of selected invoices */}
                {(() => {
                  const selectedTotal = (invoices.data ?? [])
                    .filter((inv) => selectedInvoiceIds.has(inv.id))
                    .reduce((sum, inv) => sum + inv.outstandingPaise, 0);
                  const selectedIds = Array.from(selectedInvoiceIds);
                  return (
                    <>
                      <View style={styles.payTotal}>
                        <Text style={[styles.payTotalLabel, { color: theme.textPrimary }]}>
                          Total
                        </Text>
                        <Text style={[styles.payTotalAmount, { color: theme.textPrimary }]}>
                          {formatINR(selectedTotal, { withPaise: false })}
                        </Text>
                      </View>

                      <Button
                        label={
                          paying || confirmPayment.isPending
                            ? 'Processing…'
                            : selectedIds.length === 0
                              ? 'Select invoices to pay'
                              : `Pay ${formatINR(selectedTotal, { withPaise: false })}`
                        }
                        onPress={() => {
                          if (selectedIds.length === 0) return;
                          setPayModalVisible(false);
                          void pay(selectedIds);
                        }}
                      />
                    </>
                  );
                })()}

                <Pressable
                  style={styles.payCancel}
                  onPress={() => setPayModalVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[styles.payCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </Pressable>
                </View>
              </View>
            </Modal>

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
  // --- Payment selection modal ---
  payModal: { flex: 1, justifyContent: 'flex-end' },
  payBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  paySheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  paySheetTitle: { fontSize: 18, fontWeight: '700' },
  payInvoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payInvoiceInfo: { flex: 1 },
  payInvoiceLabel: { fontSize: 15, fontWeight: '600' },
  payInvoiceSub: { fontSize: 13 },
  payInvoiceAmount: { fontSize: 15, fontVariant: ['tabular-nums'] },
  payTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payTotalLabel: { fontSize: 16, fontWeight: '700' },
  payTotalAmount: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  payCancel: { alignItems: 'center', paddingVertical: 8 },
  payCancelText: { fontSize: 15, fontWeight: '600' },
});
