# Heaven Hospitality

A property-management system for a PG/hostel: rent, invoices, payments, receipts,
electricity, mess, complaints and occupancy — one mobile app for owner and
resident alike, and a public experience that needs no account at all.

## Status

**Phase 2 (Foundation) complete.** Workspace, tooling, API, database, design
tokens and both client shells build, run and are tested.

**Public + NON_RESIDENT experience complete.** Three roles — `ADMIN`,
`RESIDENT`, `NON_RESIDENT` — with every public signup producing a
zero-permission `NON_RESIDENT`; the frontend cannot ask for anything else.

The public API (`/api/v1/public/*`) is unauthenticated and serves property,
rooms, availability, today's and the week's menu, facilities, gallery, rules,
contact and location — all from PostgreSQL, all through public-only DTOs.

The mobile app opens straight into it: five bottom tabs (Home, Rooms, Menu,
Explore, Profile) with the secondary pages behind Explore. A guest and a
signed-in non-resident see the same screens; the account only adds a profile.

Everything the owner can reasonably change — the menu and its timings, meal
overrides for a specific date, prices, availability, facilities, rules, gallery,
contact details and the public bank/UPI switches — lives in the database. None of
it requires a new mobile build.

Tenancy management (`NON_RESIDENT → RESIDENT`) and room assignment live in the
owner console inside the mobile app. There is deliberately no separate web
console — everything an owner does happens in the same app a resident uses.
Next: bringing the rest of the owner's admin work (billing, electricity,
settings, staff and operations) into that same mobile owner console.

See [docs/](./docs) for the decisions that shape the code, and
[docs/README.md](./docs/README.md) for where to start reading.

## Stack

React Native (Expo) · React + Vite · Node + Express 5 · PostgreSQL (Neon) + Prisma ·
TanStack Query · Zod · Pino · Vitest · pnpm workspaces

## Requirements

- Node **22.13+**
- pnpm **10+**
- Docker (only for local object storage)
- A Neon PostgreSQL database

## Getting started

```bash
pnpm install

cp .env.example .env      # then fill in the Neon URLs and generate JWT secrets
pnpm db:generate
pnpm db:migrate
pnpm db:seed              # one fully-populated property, and one account per role

pnpm dev:api              # http://localhost:4000
pnpm dev:admin            # http://localhost:5173
pnpm dev:mobile           # Expo
```

`.env` lives at the repository root and is found by every app. **It is never
committed** — put real values there, never in `.env.example`.

### Signing in

Everyone signs in with a **mobile number and password**. The role on the account
decides what opens; there is no separate admin login.

`pnpm db:seed` prints the development accounts it created. As shipped:

| Role           | Mobile number   | Password          |
| -------------- | --------------- | ----------------- |
| `ADMIN`        | `+919999999999` | `HeavenDemo#2026` |
| `RESIDENT`     | `+919000000004` | `HeavenDemo#2026` |
| `NON_RESIDENT` | `+919000000020` | `HeavenDemo#2026` |

Development only — change `BOOTSTRAP_OWNER_*` before deploying anything. **Quote
the password in `.env`**: an unquoted `#` starts a comment, so `Secret#2026`
silently becomes `Secret`.

Signing up in the app is self-service and always produces a `NON_RESIDENT` — an
account with no permissions at all. Only the seed or an admin can grant
`RESIDENT` or `ADMIN`.

Signup and password reset both verify the number by SMS code. No SMS is actually
sent in development: `OTP_PROVIDER=mock` logs the code, and `OTP_DEV_FIXED_CODE`
(default `123456`) makes every code the same so there is no log to read. Both
are startup errors in production.

Object storage for file uploads is only needed once that work starts:

```bash
pnpm storage:up           # MinIO on :9000, console on :9001
```

### Database

PostgreSQL is hosted on [Neon](https://neon.tech) for every environment. Two URLs
are required and they are **not interchangeable**:

| Variable              | Endpoint                 | Used by         |
| --------------------- | ------------------------ | --------------- |
| `DATABASE_URL`        | pooled (`...-pooler...`) | the running API |
| `DIRECT_DATABASE_URL` | unpooled                 | Prisma Migrate  |

Neon's pooler runs PgBouncer in transaction mode and cannot run migrations.
Pointing migrations at the pooled URL fails in ways that look like network errors.

## Commands

| Command           | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `pnpm verify`     | build packages → typecheck → lint → test. Run before pushing |
| `pnpm build`      | Build everything                                             |
| `pnpm typecheck`  | Typecheck every workspace                                    |
| `pnpm lint`       | ESLint across the repo                                       |
| `pnpm test`       | All test suites                                              |
| `pnpm format`     | Prettier write                                               |
| `pnpm db:migrate` | Create and apply a migration                                 |
| `pnpm db:studio`  | Prisma Studio                                                |

## Layout

```
apps/
  api/        Express API, scheduled jobs, webhooks (modular monolith)
  admin/      React + Vite operations console
  mobile/     Expo app — public area (no account needed) + resident and owner areas
packages/
  contracts/  Zod schemas, inferred types, error codes, role matrix
  money/      Integer-paise arithmetic
  tokens/     Design tokens shared by admin and mobile
  tsconfig/   Shared strict TypeScript bases
docs/         Architecture decision records
```

## Conventions worth knowing before you write code

- **Money is integer paise.** Never a float, never a string.
  [docs/0002](./docs/0002-money.md)
- **Authorization lives in the service layer**, not the route. A route that forgets
  a guard must still fail. [docs/0004](./docs/0004-authorization.md)
- **Prisma models never leave the mapper.** Endpoints return DTOs.
- **Handlers read `req.validated`**, never `req.body` / `req.query` directly.
- **Anything retryable must be idempotent** — jobs, webhooks, payments.
  [docs/0006](./docs/0006-idempotency-and-jobs.md)
- **Mobile dependencies are installed with `expo install`**, never `pnpm add`.
- No `console.log` in the API; use the Pino logger, which redacts centrally.

## Testing

Business-critical logic is what gets tested: money arithmetic, authorization,
allocation, invoice calculation, payment verification, webhook replay. Trivia is
not tested for coverage's sake.

```bash
pnpm test
```
