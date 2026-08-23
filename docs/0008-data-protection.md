# 0008 — Data protection

**Status:** Accepted · **Date:** 2026-08-23

## Account deletion and deactivation (DPDP Act 2023)

Deletion **anonymizes PII and retains financial and audit history.**

Physical deletion of financial history is not performed. Bookkeeping, dispute
handling and compliance all require that an invoice issued in March still exists in
December.

On an approved deletion/deactivation request:

| Data                                                      | Action                                      |
| --------------------------------------------------------- | ------------------------------------------- |
| Name, email, phone, profile image, emergency contact      | Anonymized in place                         |
| Identity documents in object storage                      | Deleted; keys nulled                        |
| Push tokens, sessions                                     | Deleted and revoked                         |
| Invoices, payments, receipts, adjustments, deposit ledger | **Retained**, linked to the anonymized user |
| Audit log entries                                         | **Retained** (already redacted)             |

Anonymization is an **explicit, audited operation** — a named service function with
its own audit entry. It is deliberately **not** a cascading delete: a cascade would
silently take financial rows with it, which is precisely the outcome to avoid.

Retention periods are a business/legal decision, not a technical one. The mechanism
is built; the schedule is configuration.

## Audit log redaction

`AuditLog.before` / `AuditLog.after` use a **field allowlist per entity type**.

**Never dump a whole database object into an audit record.** An unrestricted diff
turns the audit log into the single leakiest table in the system — the one place
where every past value of every field is retained forever.

Never stored in an audit entry:

- Passwords or password hashes
- Access tokens, refresh tokens, invite tokens, reset tokens, OTPs
- Payment secrets, webhook signatures, provider credentials
- Document file contents or signed URLs
- Phone/email/address fields that are not the subject of the change

Only the fields needed to **explain the business change** are recorded. A rent
change stores the old and new rent — not the tenant's phone number.

## File uploads

Uploaded **through the API**, not by presigned PUT. At this scale the simplicity is
worth more than offloading the bytes, and it lets the server enforce every rule
before anything is stored:

- Size limit (5 MB default, configurable)
- MIME allowlist
- **Magic-byte verification** — the declared type must match the actual bytes
- **Images are re-encoded with `sharp`**, which strips EXIF/GPS metadata and
  neutralizes polyglot files in one step
- Randomized storage keys; the client never chooses a path (no traversal)
- Private bucket; reads go through **short-lived signed URLs**
- Uploaded files are never executed or served from the API origin

Tenant documents are private by default. There is no public path to them.

## Logging

Structured Pino logs with a request id on every entry. Redaction is configured once
in `lib/logger.ts` and never at a call site.

Never logged: passwords, tokens, OTPs, payment secrets, signatures, document
contents, or personal data beyond the identifiers needed to trace a request.

Security events that **are** logged: login success and failure, account lockout,
permission denial, payment verification failure, webhook signature failure,
administrative changes.

## Public exposure

See [0004](./0004-authorization.md#public--guest-endpoints). The guest experience
shows property marketing information and **coarse** availability. It never exposes
bed ids, tenant data, occupancy history, or internal identifiers.
