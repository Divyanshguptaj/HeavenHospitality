# Heaven Hospitality

A property-management system for a PG/hostel: rent, invoices, payments, receipts,
electricity, mess, complaints and occupancy — with an admin web console, a tenant
mobile app, and a public guest experience that needs no account.

## Status

**Phase 2 (Foundation) complete.** The workspace, tooling, API skeleton, database
connection, design tokens and both client shells build, run and are tested. Domain
features land next, as vertical slices.

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

pnpm dev:api              # http://localhost:4000
pnpm dev:admin            # http://localhost:5173
pnpm dev:mobile           # Expo
```

`.env` lives at the repository root and is found by every app. **It is never
committed** — put real values there, never in `.env.example`.

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
  mobile/     Expo app — public guest area + authenticated tenant area
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
