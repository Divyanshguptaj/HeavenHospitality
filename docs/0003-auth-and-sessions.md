# 0003 — Authentication and sessions

**Status:** Accepted · **Date:** 2026-08-23

## Decision: password authentication, not OTP

The brief specified phone → OTP → token. **Rejected for MVP.**

Transactional SMS in India requires TRAI **DLT registration** (entity, header and
template registration through a telecom operator) — realistically 1–3 weeks of
regulatory lead time — and no SMS provider is in the stack. WhatsApp OTP needs Meta
business verification plus template approval, with comparable lead time.

Hostel tenants are onboarded **in person by staff**, not by self-signup, so
password auth is the honest fit and blocks nothing.

- Identifier: **email or phone** + password
- Hashing: **Argon2id** (bcrypt acceptable fallback)
- Accounts are **admin-provisioned**; there is no public registration endpoint
- First login forces a password set via a single-use, expiring invite token
- Password reset via **email** (already in the stack)

An `AuthChannel` seam keeps SMS/WhatsApp OTP addable later without touching the
token layer.

## Tokens

| Token   | Lifetime | Contents                                        |
| ------- | -------- | ----------------------------------------------- |
| Access  | 15 min   | `sub`, `role`, `sessionId`, `iat`, `exp`        |
| Refresh | 30 days  | Opaque random string; **only a hash is stored** |

The access token carries **no permissions** — permissions are resolved server-side
per request from the role matrix ([0004](./0004-authorization.md)). A stale token
must never grant stale authority.

### Rotation and reuse detection

Every refresh issues a new refresh token and revokes the previous one, within one
transaction. Tokens belong to a **family**.

**If an already-revoked token in a family is presented, the entire family is
revoked immediately.** That is the signature of a stolen token being replayed, and
it logs the user out of that device chain rather than letting an attacker ride
along silently.

`RefreshSession` stores: `tokenHash`, `familyId`, `userId`, `deviceLabel`,
`createdAt`, `expiresAt`, `revokedAt`, `replacedById`. This table is also the
device/session list a user can review and revoke.

## Token transport — one API, two clients

**The API is uniformly Bearer-token.** Every authenticated endpoint reads
`Authorization: Bearer <access token>`, identically for mobile and admin. There is
one API contract.

| Client | Access token   | Refresh token                                  |
| ------ | -------------- | ---------------------------------------------- |
| Mobile | In memory      | **Expo SecureStore**, sent in the request body |
| Admin  | In memory only | **httpOnly + Secure + SameSite=Lax cookie**    |

### Why the admin refresh token is a cookie

> This is an interpretation of the "do not depend on browser cookies" decision and
> is open to revision.

"Token-based, not cookie-based" is honoured where it matters: the **auth mechanism**
for all API calls is the Bearer header, so mobile and admin use the same API with
no cookie logic and no CSRF surface.

The cookie applies to exactly **two endpoints** (`/auth/refresh`, `/auth/logout`)
and exists for one reason: a refresh token in `localStorage` is readable by any
XSS, and exfiltrating it yields **30 days** of account access from the attacker's
own machine. In an httpOnly cookie it cannot be read by script at all.

Both subdomains sit under one registrable domain (`*.heavenhospitality.in`), so
`SameSite=Lax` works without `SameSite=None`. A double-submit CSRF token guards
the two cookie endpoints.

**Access tokens are never written to `localStorage` or `sessionStorage` in the
admin.** They live in a module-scoped variable and are re-obtained by refresh on
page load.

If we later accept the XSS risk for simplicity, only these two endpoints change.

## Brute-force protection

Two independent layers, because each covers the other's blind spot:

1. **Per-IP, in-memory** (`express-rate-limit`) — cheap, catches scripted floods,
   resets on deploy.
2. **Per-account, in PostgreSQL** — `failedLoginAttempts`, `lockedUntil`,
   `lastFailedLoginAt` on `User`.

Layer 2 is required precisely because layer 1 is in-memory: **a server restart must
not reset account lockout**, and an attacker rotating IPs must still be stopped.

- Lockout after N consecutive failures (configurable), for an increasing window
- The counter resets only on a **successful** login
- Responses are identical for "no such user" and "wrong password" — no enumeration
- Both outcomes are logged as security events with the request id

## Logging rules

Never logged, at any level: passwords, password hashes, access tokens, refresh
tokens, invite tokens, reset tokens, OTPs, payment secrets, webhook signatures.

Pino is configured with a redaction list covering `authorization`, `cookie`,
`set-cookie`, `password`, `token`, `refreshToken`, `secret`. Redaction is
configured centrally in `lib/logger.ts` — never per call site.

## Mobile specifics

- Refresh token in **Expo SecureStore**. Never `AsyncStorage` (OWASP MASVS-STORAGE).
- Optional biometric app lock gates _app access_, never API authorization.
- TLS verification is never disabled, in any build variant, for any reason.
