# 0002 — Money

**Status:** Accepted · **Date:** 2026-08-23

## Decision

**Every authoritative monetary value is an integer number of paise**, stored in a
PostgreSQL `integer` column, and typed as `Paise` from `@heaven/money`.

Prisma `Decimal` was the alternative and was rejected.

## Why paise-as-integer rather than Decimal

1. Every amount in this domain is a currency amount, never a fraction of a paise.
   `Decimal` invites `0.005` intermediates that have no meaning here.
2. `Decimal` maps to Decimal.js. Equality, JSON serialization and Zod validation
   each need custom handling at every boundary. Integers need none.
3. Rounding becomes **explicit and singular**: there is exactly one `roundPaise()`
   and it is called in exactly two places.

## Column type: `Int`, not `BigInt`

`integer` holds 2,147,483,647 paise ≈ **₹2.14 crore** per row. No single invoice,
payment or deposit in a hostel approaches this.

`MAX_AMOUNT_PAISE` in `@heaven/money` rejects anything above **₹1 crore**, leaving
roughly 2× headroom and — more usefully — catching a rupees-where-paise-was-meant
bug, which is 100× too large.

Aggregates are safe regardless: PostgreSQL `SUM(integer)` returns `bigint`.

`BigInt` was rejected because it does not survive `JSON.stringify`, which would
force a custom serializer on every response in the application.

## Rounding

- Mode: **half away from zero** (0.5 → 1, −0.5 → −1), the ordinary Indian
  commercial convention.
- `roundPaise()` in `@heaven/money` is the **only** rounding in the system.
- Callers round immediately after a **single** multiply or divide. Never
  accumulate un-rounded intermediates.

### Is this not "floating point for money"?

No. Stored values are always integers. The only non-integer intermediate is one
arithmetic operation immediately followed by `roundPaise`. Our magnitudes (≤ 1e9
paise) are far below the 2^53 exact-integer limit of a double, so one operation's
representation error is ~1e-7 paise — many orders of magnitude too small to move a
value across a `.5` boundary.

Where exactness is genuinely required — parsing human input like `"8000.50"` —
`rupeesToPaise()` parses the **string** and never touches float at all. It
deliberately _rejects_ a number already corrupted by float arithmetic
(`0.1 + 0.2` → `0.30000000000000004`) rather than silently rounding it into the
ledger.

## The two places rounding happens

1. **Electricity**: `units × paisePerUnit` → `multiplyPaise()`
2. **Proration**: `monthlyRent × occupiedDays / daysInPeriod` → `proratePaise()`

Everything else — invoice totals, payment allocation, outstanding balances — is
exact integer addition and subtraction.

## Splitting without losing paise

`allocatePaise(total, weights)` uses the largest-remainder method and guarantees
`sum(shares) === total` exactly. Ties break towards the lower index, so the result
is deterministic and reproducible in tests.

This is what splits a room's electricity bill across its tenants
([0005](./0005-billing-rules.md#electricity)) with no paise created or destroyed.

## Currency

`INR` only, stored explicitly on financial records. Multi-currency is not
supported and no code should imply that it is.

## Rules

- Never use `+`/`*` on rupee values anywhere in the codebase.
- Never store money as `Float`, `Decimal`, or a string.
- Formatting (`formatINR`) is **display only**. Never parse its output back.
- API request/response bodies carry **paise as integers**. Clients format.
