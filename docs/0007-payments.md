# 0007 — Payments

**Status:** Accepted · **Date:** 2026-08-23

**The frontend never decides that a payment succeeded.** Not the Razorpay checkout
callback, not a query parameter, not a client-supplied amount.

## Online payment flow

```
Tenant taps Pay
      ↓
Backend computes the payable amount from the invoice   ← never from the client
      ↓
Backend creates a Razorpay order, stores providerOrderId
      ↓
Client completes payment in the Razorpay UI
      ↓
Callback  AND/OR  webhook arrives
      ↓
Backend verifies the signature server-side
      ↓
Backend confirms order + payment state with Razorpay
      ↓
ONE transaction: record Payment → allocate → update Invoice → issue Receipt
      ↓
Queue notification
```

Two independent paths converge — the client callback and the webhook — and both
call the **same** `settlePayment()` function. Whichever arrives first wins; the
second is a no-op.

Convergence is enforced by the database, not by ordering:

```prisma
providerPaymentId String @unique
```

### Signature verification

Razorpay uses **two different secrets**, which is a common source of confusion:

| Path            | Signed payload                           | Secret             |
| --------------- | ---------------------------------------- | ------------------ |
| Client callback | `razorpay_order_id\|razorpay_payment_id` | Key secret         |
| Webhook         | Raw request body                         | **Webhook secret** |

Both use HMAC-SHA256 and both are compared with a **timing-safe** comparison.

### The Express raw-body requirement

Webhook signature verification hashes the **exact bytes** Razorpay sent. Once
`express.json()` has parsed and re-serialized the body, the bytes differ and every
signature check fails.

The webhook route must be mounted with `express.raw({ type: 'application/json' })`
**before** the global JSON parser.

Getting this wrong presents as "Razorpay is sending invalid signatures". It is not.

### Failure is not success

If the signature verifies but Razorpay cannot be reached to confirm the payment
state, the payment stays **`PENDING`/unverified**. It is never marked paid
optimistically. A payment the server could not verify is a payment that did not
happen, as far as the ledger is concerned.

## Manual payments (required from MVP)

Cash and direct UPI are the dominant real-world case in a PG, and they are also
where staff fraud lives. Supported methods: `CASH`, `UPI`, `BANK_TRANSFER`,
`RAZORPAY`.

Recording a manual payment requires: amount, date, method, reference/UTR where the
method has one, **the recording staff member**, and an optional note.

- Every manual payment writes an `AuditLog` entry with the actor. Non-negotiable.
- **Staff cannot silently edit a confirmed payment.** There is no update endpoint.
- Corrections go through **reversal + re-entry**, both audited, so the original
  record and the correction are both visible.
- The same `Idempotency-Key` mechanism prevents a double-submitted form from
  recording the payment twice.

## Receipts

A receipt is issued in the **same transaction** as the payment it evidences. A
payment without a receipt, or a receipt without a payment, cannot exist.

### Numbering

Gapless sequential numbers **per property per financial year**, which Indian
bookkeeping expects.

`count() + 1` races: two concurrent payments read the same count and produce
duplicate numbers.

```sql
SELECT last_number FROM "ReceiptSequence"
 WHERE property_id = $1 AND fiscal_year = $2
   FOR UPDATE;
```

A row lock inside the payment transaction — one extra statement, no extra
infrastructure. Deliberately not more elaborate than that.

## Refunds

Initiating a refund does **not** complete it. See
[0005](./0005-billing-rules.md#refunds) for the state machine; state advances on
verified webhook events only.

## What is never done

- Trusting a client-reported success, amount, or invoice id
- Marking an invoice paid from a callback without server-side verification
- Exposing the Razorpay key secret or webhook secret to any client
- Processing the same webhook twice (see [0006](./0006-idempotency-and-jobs.md#webhook-idempotency))
- Logging signatures, secrets, or full payment payloads
- Deleting or editing a settled payment record

## Reconciliation note

Razorpay settles **net of fees**; the gateway amount and the bank credit differ.
MVP records the gross payment against the invoice, which is the tenant-facing
truth. Fee/settlement reconciliation is out of scope and noted here so it is a
known gap rather than a discovered surprise.
