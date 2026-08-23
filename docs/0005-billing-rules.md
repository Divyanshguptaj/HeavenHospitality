# 0005 — Billing rules

**Status:** Accepted · **Date:** 2026-08-23

All amounts are integer paise ([0002](./0002-money.md)). All dates are evaluated in
the **property's timezone** (`Asia/Kolkata` by default), never the server's or the
device's.

## Identity model: User / Tenancy / Allocation

The brief used "Tenant" to mean both a person and a stay, and hung `room`/`bed`
directly on it. That breaks on cases the brief itself lists.

| Entity       | Means                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| `User`       | A person. One row forever. Login identity.                                    |
| `Tenancy`    | One **stay**: property, dates, rent, deposit, status.                         |
| `Allocation` | Bed occupancy **interval** within a tenancy (`bedId`, `startedAt`, `endedAt`) |

Consequences, all of which the brief needed and could not express before:

- A tenant who leaves and returns gets a **second Tenancy**, same User.
- A room change closes one Allocation and opens another. History is preserved by
  construction, not by remembering to write a log row.
- **Phone numbers are not globally unique on the person record.** A parent's number
  may appear on several tenancies; a returning tenant reuses theirs. Uniqueness is
  enforced only on **login identity** (`User.email`, `User.phone` where used to
  authenticate), never on contact fields.

All billing hangs off `Tenancy`, never `User`.

## Invoice lifecycle

```
DRAFT ──issue──► ISSUED ──payment──► PARTIALLY_PAID ──payment──► PAID
  │                 │
  │                 └──due date passes──► OVERDUE ──payment──► PAID
  └──► CANCELLED                                   └──► CANCELLED (with reason)
```

**A `DRAFT` invoice is mutable. An `ISSUED` invoice is immutable.**

This resolves the brief's own contradiction between "financial data is immutable"
(§2.2) and "invoice regenerated" (§12). Regeneration is permitted only against a
`DRAFT`. After issue, every change is an `Adjustment` row — discount, waiver,
correction, credit note — never an edit in place.

Idempotency of generation comes from the database:

```prisma
@@unique([tenancyId, periodKey, kind])   // periodKey = "YYYY-MM"
```

Running the monthly job twice cannot produce two invoices for the same month.

### Invoice items carry their source

Every `InvoiceItem` records `sourceType` + `sourceId` (electricity bill share,
late-fee rule, adjustment, …). The brief requires that charges are never hidden
inside a single total, and this is how a line traces back to the thing that
created it.

## Payment allocation

**Across invoices: oldest outstanding first.**

**Within one invoice, in this order:**

1. Base rent / principal
2. Electricity and other normal charges
3. **Late fee last**

Late fee is never allocated before principal. Allocating fees first inflates the
principal that late fees then accrue on — a fee-on-fee spiral that is both wrong
and indefensible to a tenant.

Partial payments are fully supported. `PaymentAllocation(paymentId, invoiceId,
amountPaise)` records where each paise landed, so one payment may span invoices and
one invoice may receive many payments.

### Excess becomes tenant credit

Any amount not allocated stays on the payment as `unallocatedPaise` and forms the
tenancy's **credit balance**, applied automatically to the next invoice issued.

This is what gives the brief's "duplicate payment" and "advance payment" edge cases
somewhere to land. Without it there is no correct home for an overpayment.

## Late fees

Configurable **per property**, versioned via `LateFeeRule(propertyId, graceDays,
perDayPaise, maxPaise, effectiveFrom)`.

Defaults — **configuration, never constants in code**:

- `perDayPaise` = ₹100/day
- `maxPaise` = **₹3,000 per invoice**

The cap is not optional. Uncapped daily accrual against a vacated non-payer
produces balances nobody will ever collect and every one of which then needs a
manual waiver.

### Recompute, never accrue

The obvious implementation — append a late-fee row each night — is fragile: a
missed night under-charges, a double run over-charges.

Instead there is **exactly one `LATE_FEE` item per invoice**, and its amount is a
**pure function**:

```
lateFee(dueDate, graceDays, perDayPaise, maxPaise, outstandingSince, settledAt, waivedAt, now)
```

upserted on each run.

This is idempotent **by construction**: running the job zero, one or fifty times
converges on the same value, and a missed day self-heals on the next run. It is
also unit-testable with no database.

Rules the function encodes:

- No fee before `dueDate + graceDays`
- Accrues while **any principal** is outstanding; flat per day, not proportional
- Stops on the date outstanding reaches zero — computed from the **settlement
  date**, not from `now`
- Never exceeds `maxPaise`
- `waivedAt` set ⇒ fee is zero
- A `PAID` invoice is frozen; the function is not re-run against it

Waiving or adjusting a late fee is an admin action that writes an `AuditLog` entry
with actor and reason.

## Electricity

```
units  = currentReading − previousReading
charge = units × ratePaisePerUnit        (rounded once, half away from zero)
```

Rates are versioned: `ElectricityRate(propertyId, paisePerUnit, effectiveFrom)`.
A rate change never retroactively alters an issued bill.

Validation: a reading below its predecessor is rejected unless explicitly flagged
as a **meter replacement**; duplicate readings for one `(meterId, readingDate)` are
rejected by a unique constraint; corrections create a new reading that supersedes
the old one (`status: CORRECTED`, `correctedByReadingId`) rather than overwriting
it, and are audited.

### Split rule: day-weighted occupied days

One room meter serving several tenants splits by **occupied days within the billing
period**:

```ts
allocatePaise(
  billAmountPaise,
  tenancies.map((t) => t.occupiedDaysInPeriod),
);
```

If everyone occupied the full period the weights are equal and the split is equal —
so equal-split is the natural special case, not a separate code path.

`allocatePaise` guarantees the shares sum **exactly** to the bill; no paise is
created or lost ([0002](./0002-money.md#splitting-without-losing-paise)).

The strategy is isolated behind a single function so an alternative rule
(equal-split, metered-per-bed) can be introduced without touching billing.

## Security deposit

**Not a field on the tenancy.** A deposit is money held on someone's behalf and
needs a ledger.

`DepositTransaction(tenancyId, kind, amountPaise, reason, actorUserId)` where kind
is `COLLECT` · `DEDUCT` · `REFUND` · `FORFEIT`.

Derived tenancy deposit status: `COLLECTED` → `HELD` → `PARTIALLY_ADJUSTED` →
`REFUNDED` | `FORFEITED`.

- `FORFEIT` requires an explicit authorized action with a recorded reason. It is
  never a side effect of anything.
- Every `DEDUCT` and `REFUND` writes an `AuditLog` entry.
- The held balance is always `sum(COLLECT) − sum(DEDUCT + REFUND + FORFEIT)`,
  derived from the ledger, never stored as a mutable field.

## Move-out and final settlement

**A tenancy does not close automatically.** `VACATED` is reached only when a
settlement is explicitly confirmed.

```
NOTICE_PERIOD
  → final meter reading recorded
  → settlement drafted
  → owner/manager reviews
  → settlement confirmed  ──►  VACATED, bed released
```

The settlement draft accounts for:

- Prorated rent for the final partial month (`proratePaise`)
- All unpaid invoices
- Final electricity reading and charge
- Other pending charges (mess dues, damages)
- Deposit held, less authorized deductions
- **Net result**: refund due to tenant, or final balance payable

Until confirmation the bed stays allocated. Releasing a bed before settlement loses
the leverage and the audit trail at exactly the moment they matter most.

## Refunds

Never assume success from an API call. Razorpay refunds are asynchronous and the
provider's status is authoritative.

```
PENDING → PROCESSING → COMPLETED
                    └─► FAILED
        └─► CANCELLED
```

State advances on **verified webhook events only** ([0007](./0007-payments.md)),
never on the response to the initiating call.

## Reports (MVP scope)

Fixed, small, driven by SQL. No BI layer, no forecasting, no cohort analytics.

Monthly rent collection · outstanding dues · overdue tenants · payment history ·
occupancy summary · upcoming vacancies · electricity usage/billing summary ·
complaint status and resolution summary · mess attendance/meal counts.

**CSV export** is sufficient for every one of them.
