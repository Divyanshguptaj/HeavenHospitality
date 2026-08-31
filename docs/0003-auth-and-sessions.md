# 0003 — Authentication and sessions

**Status:** Accepted · **Date:** 2026-08-31 (supersedes the 2026-08-23 decision)

## Decision: password login, OTP only to prove a phone number

An earlier revision of this document rejected OTP outright and made accounts
admin-provisioned with email reset. That is **superseded**: the app now has
public self-service signup, so a phone number has to be proven before an account
can be attached to it.

Every login is still **mobile number + password**. OTP is used at exactly two
moments, and never as a routine login step:

1. **Signup** — proving the number belongs to the person claiming it
2. **Password reset** — proving it again, since a reset bypasses the password

- Identifier: **mobile number** (E.164, unique). Email is optional profile data
  and cannot be used to sign in
- Hashing: **Argon2id**
- Password rules: 8+ characters with a letter and a digit — length is what
  resists guessing; composition rules mostly produce `Password1!`
- Roles: `ADMIN`, `RESIDENT`, `NON_RESIDENT`. Public signup **always** produces
  `NON_RESIDENT`, which holds no permissions at all
- The first `ADMIN` comes from the seed / `BOOTSTRAP_OWNER_*`. No public route
  can create one

### SMS delivery is still not solved

Transactional SMS in India requires TRAI **DLT registration** (entity, header and
template registration through a telecom operator) — realistically 1–3 weeks of
lead time. That has not happened, so `OtpProvider` currently resolves to
`MockOtpProvider`, which logs the code instead of sending it.

This is safe only because it cannot reach production. Two independent guards:

- `MockOtpProvider`'s constructor throws when `NODE_ENV=production`
- the environment schema rejects `OTP_PROVIDER=mock` and any value of
  `OTP_DEV_FIXED_CODE` in production, so the API refuses to boot

Replacing the mock with a real gateway is an edit to `otp.provider.ts` alone —
expiry, attempt limits, one-time use and resend cooldown are ours and live in
`otp.service.ts`, so no vendor gets to reimplement them.

### What makes a code worth anything

A code that could be replayed, brute-forced or requested in a loop would prove
nothing. Each is closed deliberately:

| Property                          | How                                                          |
| --------------------------------- | ------------------------------------------------------------ |
| Unguessable                       | `randomInt` (CSPRNG), never `Math.random`                    |
| Not readable from a database dump | stored as SHA-256, compared in constant time                 |
| Expires                           | `OTP_TTL_MINUTES`, default 10                                |
| Survives limited guessing         | `OTP_MAX_ATTEMPTS`, default 5, then the code is burned       |
| Cannot be replayed                | `consumedAt` set the moment it succeeds                      |
| Cannot be spammed                 | per-phone cooldown in the database + per-IP `otpSendLimiter` |
| Only one live at a time           | issuing a new code consumes every earlier one                |

The attempt counter is incremented **before** the comparison, so a client that
disconnects mid-request still spends its guess.

### Verification tokens

Verifying a code returns a short-lived opaque `verificationToken` (stored
hashed), and the next step — set password — requires it. Without that, "set a
password on this number" would need only the phone number itself.

The token is bound to both the phone and the purpose, so a `SIGNUP` verification
cannot be redeemed to reset an existing account's password. It is single-use:
redeeming clears the hash under a `WHERE` on that same hash, so two concurrent
redemptions cannot both win.

### Password reset does not confirm the number exists

`POST /auth/forgot-password/request-otp` returns the same response for a
registered and an unregistered number, and only actually sends when an eligible
account exists. Signup necessarily _does_ reveal existence — any usable signup
form must — which is precisely why reset does not.

A completed reset revokes every session for that user: a reset is how someone
responds to a suspected compromise, so leaving the attacker signed in would
defeat it. It also clears any lockout, which is how a locked-out user recovers.

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
