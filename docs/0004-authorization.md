# 0004 — Authorization

**Status:** Accepted · **Date:** 2026-08-23

## Roles

`ADMIN` · `RESIDENT` · `NON_RESIDENT`

`ADMIN` is the person who runs the property. `RESIDENT` lives here. `NON_RESIDENT`
is a registered account that is not a tenant.

"Guest" is **not a role** — it is the absence of authentication. There are no guest
users, no guest rows, and no fake accounts created to view public information.

### NON_RESIDENT holds no permissions, deliberately

`ROLE_PERMISSIONS.NON_RESIDENT` is empty, and public signup writes **no
`PropertyMembership` row**. An account created through `POST /auth/signup/*` can
therefore reach exactly what an unauthenticated caller can reach, and nothing
more.

This is what makes registration safe to leave open. Everything a non-resident
sees is served by `/api/v1/public/*`, which needs no token at all — so there is
no privilege for signup to grant, and no request field that could ask for one.
The role is chosen server-side (`DEFAULT_SIGNUP_ROLE`); a `role` in the request
body is not read.

Promotion `NON_RESIDENT → RESIDENT` happens when an admin accepts someone as a
tenant, and the reverse when a tenancy ends. Neither is reachable from a public
route.

### Permissions are a code constant, not a database table

`ROLE_PERMISSIONS` is a frozen map from role to permission keys, defined in
`@heaven/contracts` and shared by API and admin.

The brief put a "Permissions" screen in admin settings, implying runtime-editable
granular permissions. **Deferred.** A runtime permission editor is a feature in its
own right and a privilege-escalation surface. The settings screen renders the
matrix **read-only**.

The admin uses the same constant to hide unavailable actions. That is a **UX
affordance only** — see below.

## Property scoping

`PropertyMembership(userId, propertyId, role)` records where an account holds
authority. Only `ADMIN` and `RESIDENT` are meaningful there — a non-resident holds
authority nowhere, so it has no row.

`User.role` answers a different question: "what may this account do at all",
which is what a route guard needs before any property is in scope. It is the
value the access token carries and the one `requireRole` reads.

**Every property-scoped request resolves access through exactly one helper:**

```ts
await assertPropertyAccess(actor, propertyId);
```

Nothing else may resolve property scope independently. This is what makes adding
`Organization` later a one-file change ([0001](./0001-architecture.md#organization-is-deferred-not-designed-out)).

## The three checks, on every protected request

Hiding a button is not authorization. Every protected endpoint independently
verifies:

1. **Authentication** — a valid, unexpired access token
2. **Role capability** — the actor's role holds the required permission
3. **Resource ownership** — the requested record actually belongs to a property
   the actor can access, or to the actor themselves

Check 3 is the one that stops IDOR, and it is the one most often skipped.

### IDOR: never trust an id from the client

Wrong:

```ts
const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
return invoice; // any authenticated user can read any invoice
```

Right — ownership is part of the query, not an afterthought:

```ts
const invoice = await repo.findInvoiceForActor({ invoiceId, actor });
if (!invoice) throw new NotFoundError('INVOICE_NOT_FOUND');
```

**A resource the actor may not access returns `404`, not `403`.** A `403` confirms
the record exists, which leaks tenant structure to an enumeration attack.

### Tenant scope

A tenant may read invoices — **only their own**. Tenant-facing repositories take
the actor's `tenancyId` as a required argument; there is no code path that accepts
a tenancy id straight from the request body.

## Authorization lives in the service layer

Guards in route handlers are convenience, not the mechanism. Every service method
that touches a scoped resource performs its own check, so a route that forgets a
guard still fails closed.

This is also why services are the unit under test for authorization: the negative
cases ("staff at property A requests a tenant at property B") are integration
tests, not manual QA.

## Postgres Row-Level Security: rejected for MVP

The brief suggested RLS as defence in depth. Rejected because Prisma + RLS requires
`SET LOCAL app.current_user_id` on the _same pooled connection_ as the query, which
means either a transaction per request or a raw-client shim. That is real
complexity and a real bug surface, in exchange for defence in depth on a
single-application, single-database deployment where the app is the only client.

Reconsider **only** if a second application ever connects to this database.

What we do instead: `propertyId` is a required argument in the repository layer,
and negative-path authorization tests are mandatory for every scoped module.

## Public endpoints

Everything under `/api/v1/public/*` is unauthenticated and lives in its own module
with **its own mappers**. It never reuses an admin or resident serializer.

The same endpoints serve a guest, a signed-in `NON_RESIDENT` and a `RESIDENT` —
the response does not vary by caller, because none of them is identified. That is
what lets one set of screens serve all three without being forked by role.

The property is implicit: the MVP runs one property, so no path carries a slug or
an id and there is nothing for a caller to enumerate.

**Never exposed:** database ids of any kind, bed ids, room-to-tenant mapping,
resident names, resident phone numbers, documents, occupancy history, complaint
data, payment records, staff data, object-storage keys, or any private
configuration.

**Bank and UPI details are governed by two independent switches** —
`showBankDetailsPublicly` and `showUpiPublicly`. A detail the owner has not
published is absent from the response entirely, not nulled out and not hidden by
the client: it is filtered at the query, so it never leaves the database.

**Availability is deliberately coarse** — "3 beds available in 3-sharing rooms",
never a bed list. Precise availability is an occupancy map of where people live.

Protections:

- Per-IP rate limiting, tighter than authenticated routes
- A short in-memory response cache (seconds). **No Redis** — a small TTL map is
  sufficient and is discarded on restart without consequence
- Every read uses an explicit Prisma `select`, never `include`. A `select` fails
  closed — a column added to a model later stays private until someone
  deliberately lists it
- `isActive` / `status` filters live in the `WHERE` clause, never in the mapper,
  so an unpublished record is never loaded at all
- Bounded query validation and pagination on every parameterised endpoint
- Contract tests assert that no PII field name can appear in a public response

## Audit

Sensitive operations write an `AuditLog` entry inside the same transaction as the
change, so an action and its audit record cannot diverge.

Recorded: actor, actor role, action, entity type, entity id, property id, request
id, IP, and a **redacted** before/after. The redaction allowlist is in
[0008](./0008-data-protection.md) — audit entries must never become the leakiest
table in the database.

`AuditLog` is append-only. No update or delete path exists in the codebase.
