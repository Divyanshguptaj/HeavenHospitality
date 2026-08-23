# 0006 — Idempotency, jobs and database invariants

**Status:** Accepted · **Date:** 2026-08-23

The rule: **restarting the backend, retrying a request, or accidentally running a
job twice must never duplicate an invoice, late fee, payment, allocation or
notification.**

## Scheduled jobs

`node-cron` inside the API process. No Redis, no BullMQ, no separate worker.

| Job                | Cadence  | Idempotency mechanism                                                                       |
| ------------------ | -------- | ------------------------------------------------------------------------------------------- |
| Monthly invoicing  | monthly  | `@@unique([tenancyId, periodKey, kind])`                                                    |
| Late-fee recompute | daily    | Pure function + upsert of one item ([0005](./0005-billing-rules.md#recompute-never-accrue)) |
| Rent reminders     | daily    | `Notification.dedupeKey` unique                                                             |
| Notification retry | frequent | Attempt counter + terminal states                                                           |
| Expo push receipts | frequent | Ticket → receipt reconciliation, see below                                                  |

### `JobRun` is the lock and the audit record

```prisma
model JobRun {
  jobName   String
  periodKey String   // "2026-08" or "2026-08-23", the unit of work
  @@unique([jobName, periodKey])
}
```

The insert **is** the lock. A second concurrent run loses the insert and exits.

This also means correctness survives a second API instance: if the deployment ever
scales to two processes, one wins the row and the other skips. No coordination
service is required for that guarantee.

`JobRun` doubles as observability — the last successful run and last error for
every job are queryable without a log search.

## Webhook idempotency

Providers retry. The same event **will** arrive more than once, sometimes late,
sometimes out of order.

```prisma
model WebhookEvent {
  provider  String
  eventId   String
  status    WebhookStatus
  @@unique([provider, eventId])
}
```

Processing order, all inside one transaction:

1. Verify the signature against the **raw** request body
2. Insert `WebhookEvent`; a unique violation means "already seen" → `200 OK`, stop
3. Apply the business effect
4. Mark processed

A duplicate must return success, not an error — an error tells the provider to
retry, which is the opposite of what a duplicate needs.

See [0007](./0007-payments.md) for the Express raw-body requirement, which is easy
to get wrong and presents as "Razorpay is sending bad signatures".

## Idempotency keys on client-initiated writes

Operations a user can double-tap — creating a payment order, recording a manual
payment, submitting meal absence — accept an `Idempotency-Key` header, stored
unique per operation. A repeat returns the **original result** rather than creating
a second record.

## Database invariants that carry real weight

Some correctness cannot be expressed in `schema.prisma` and lives in hand-written
migration SQL. This is accepted, and each one is documented here.

### One active allocation per bed, one per tenancy

```sql
CREATE UNIQUE INDEX allocation_one_active_per_bed
  ON "Allocation" ("bedId") WHERE "endedAt" IS NULL;

CREATE UNIQUE INDEX allocation_one_active_per_tenancy
  ON "Allocation" ("tenancyId") WHERE "endedAt" IS NULL;
```

**Prisma cannot express a partial unique index.** These are written by hand into a
migration.

This is what stops two staff members allocating the same bed simultaneously. The
service catches the unique violation (`P2002`) and returns
`BED_ALREADY_ALLOCATED`. **The database decides, not an application-level
availability check** — a check-then-insert always has a race window between the two.

### Other hand-written constraints

- One `LATE_FEE` item per invoice: partial unique on `(invoiceId, kind)`
- Non-negative money: `CHECK (amount_paise >= 0)` where the domain forbids negatives
- Receipt number uniqueness per property per financial year

### Guarding against silent loss

`prisma migrate dev` regenerates migrations from the schema and can drop
hand-written SQL that the schema does not know about.

Mitigation, deliberately lightweight (no bespoke CI tooling):

- An integration test asserts each load-bearing constraint still exists and still
  rejects the violation it was written for. A concurrent double-allocation test is
  part of the bed-allocation suite.
- If the constraint disappears, that test fails. That is the whole mechanism.

## Notifications

`Notification.dedupeKey` is unique and encodes the business meaning of the message
— for example `rent-reminder:<tenancyId>:2026-08`. Re-running a reminder job cannot
send the same reminder twice.

Retries are bounded with terminal `FAILED`/`SKIPPED` states. There is no unbounded
retry loop, so a provider outage cannot become a retry storm.

### Expo push is two-phase

Sending returns a **ticket**; delivery success or failure arrives later as a
**receipt** that must be fetched separately. Skipping receipt polling means dead
push tokens silently accumulate and delivery rates quietly rot.

A small scheduled job reconciles tickets to receipts and disables tokens the
provider reports as unregistered (`DeviceToken.disabledAt`).
