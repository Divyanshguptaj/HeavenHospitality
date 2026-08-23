# Heaven Hospitality — Documentation

| Document                                                       | What it settles                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [FOUNDATION.md](./FOUNDATION.md)                               | The original product/engineering brief. Historical source of truth.    |
| [0001-architecture.md](./0001-architecture.md)                 | Stack, monorepo layout, module boundaries, deployment shape            |
| [0002-money.md](./0002-money.md)                               | Integer paise, rounding, the one place rounding happens                |
| [0003-auth-and-sessions.md](./0003-auth-and-sessions.md)       | Password auth, JWT + refresh rotation, lockout, token storage          |
| [0004-authorization.md](./0004-authorization.md)               | Roles, property scoping, IDOR defence, public/private separation       |
| [0005-billing-rules.md](./0005-billing-rules.md)               | Invoices, payment allocation, late fees, deposits, settlement, refunds |
| [0006-idempotency-and-jobs.md](./0006-idempotency-and-jobs.md) | Scheduled jobs, webhook replay, DB invariants that carry weight        |
| [0007-payments.md](./0007-payments.md)                         | Razorpay flow, manual payments, receipt numbering                      |
| [0008-data-protection.md](./0008-data-protection.md)           | DPDP deletion policy, audit-log redaction allowlist                    |

## Reading order for a new developer

Start with `0001`, then `0002` and `0004` — those three explain most of the
non-obvious code. Read `0005` before touching anything under `modules/billing`.

## Status of FOUNDATION.md

`FOUNDATION.md` is the original brief and is **superseded in places**. Where it
conflicts with an ADR in this folder, the ADR wins. The known divergences are
listed in [0001-architecture.md](./0001-architecture.md#divergences-from-the-original-brief).
