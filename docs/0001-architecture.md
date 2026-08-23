# 0001 — Architecture

**Status:** Accepted · **Date:** 2026-08-23

## Context

Heaven Hospitality is a PG/hostel operating system with three surfaces (admin web,
tenant mobile, unauthenticated guest area) over one database. Expected load is
**tens of users, ~30 concurrent at worst**. The product's value is occupancy truth
and financial correctness, not throughput.

## Decision

### Stack

| Layer            | Choice                               |
| ---------------- | ------------------------------------ |
| Mobile           | React Native + Expo + TypeScript     |
| Admin            | React + Vite + TypeScript (SPA)      |
| API              | Node.js + Express 5 + TypeScript     |
| Database         | PostgreSQL + Prisma                  |
| Server state     | TanStack Query                       |
| Client state     | Zustand, only where genuinely needed |
| Forms/validation | React Hook Form + Zod                |
| Jobs             | `node-cron` inside the API process   |
| Storage          | S3-compatible (MinIO locally)        |
| Payments         | Razorpay                             |
| Logging          | Pino                                 |
| Testing          | Vitest + Supertest                   |
| Package manager  | pnpm workspaces                      |

Express 5 is used rather than 4 because it forwards rejected promises to the error
middleware natively, which removes an entire class of unhandled-rejection bugs and
the `asyncHandler` boilerplate that goes with them.

### Backend is a modular monolith

One process serves the API, the scheduled jobs, and the payment webhooks. Modules
have clear domain boundaries but are never separate services.

```
apps/api/src/
  modules/<domain>/
    <domain>.routes.ts       thin: parse, validate, delegate
    <domain>.service.ts      business rules, authorization, transactions
    <domain>.repository.ts   Prisma access, always property-scoped
    <domain>.mapper.ts       entity -> DTO. Prisma models never leave this layer
  middleware/  lib/  jobs/  config/  errors/
```

Rules that hold everywhere:

- **Authorization lives in the service layer, not the route layer.** A route that
  forgets a guard must still fail.
- **Prisma models are never returned from an endpoint.** Every response goes
  through a mapper, so adding a column cannot silently widen an API.
- The `public/` module has **its own mappers**. Public responses are never
  produced by reusing an admin serializer — that is how tenant PII leaks.

### Repository layout

```
apps/       api/ admin/ mobile/
packages/   contracts/ money/ tokens/ tsconfig/
docs/
```

Each package exists for a stated reason, not for symmetry:

| Package     | Why it exists                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| `contracts` | Zod schemas + inferred types + error codes + role matrix, used by all three apps |
| `money`     | Paise arithmetic. Pure, heavily tested, and wrong money is unrecoverable         |
| `tokens`    | Design token **values**, consumed by admin (as generated CSS) and mobile (as TS) |
| `tsconfig`  | Shared strict TypeScript bases                                                   |

Deviations from the brief's §33, each with a reason:

- `services/api/` → `apps/api/`. One convention for all three deployables.
- `packages/types` + `packages/validation` → **one `packages/contracts`**. The
  types are `z.infer` of the schemas; splitting them means either duplication or
  a circular dependency.
- `packages/utils` **not created**. A grab-bag package with no owner. `money`
  exists instead because it is a real, testable, shared domain concern.
- `packages/config` **not created**. Env parsing is app-specific, and a shared env
  package is a route for server secrets to reach the mobile bundle.
- `prisma/` lives at `apps/api/prisma/`, not the repo root. The schema is owned by
  the API; a root-level `prisma/` implies shared DB access nothing else should have.

### Shared code policy

Share types, Zod schemas, constants, enums and API contracts. **Do not share UI
components between React Native and React web.** Mobile and admin share _design
tokens_ (colour, spacing, type scale, radius) and nothing else.

Tokens are shared as **values, not components**. `packages/tokens` holds the
numbers; the admin generates its Tailwind `@theme` block from them at build time
(the generated CSS is git-ignored, so it cannot drift), and mobile imports the same
objects directly into React Native styles. A `<View>` and a `<div>` are not the
same thing, and pretending otherwise produces bad UI on both platforms.

### Expo version discipline

React Native and React versions are chosen by **`expo install`**, never by "latest
on npm". Expo SDK 57 pins `react-native@0.86.2`; installing `0.87.0` bundles
`@expo/metro-config` against a React Native that no longer exports the polyfill
path it needs, and Metro fails with an unrelated-looking
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

Always use `pnpm --filter @heaven/mobile exec expo install <pkg>` and check drift
with `expo install --check`.

### node_modules layout

`.npmrc` sets `node-linker=hoisted`. Metro (React Native) cannot reliably resolve
pnpm's default symlinked layout; this is Expo's own documented monorepo guidance.

**Trade-off:** phantom dependencies become possible — a package can import
something it did not declare. Mitigation: every import must have a matching entry
in its own `package.json`, checked in review.

### Database hosting: Neon

PostgreSQL is hosted on **Neon** (serverless) for every environment, including
local development. There is no local PostgreSQL container.

Consequences that affect the code, not just the connection string:

- **Two URLs are required.** `DATABASE_URL` is the _pooled_ endpoint (host contains
  `-pooler`) used at runtime; `DIRECT_DATABASE_URL` is the _unpooled_ endpoint used
  by Prisma Migrate, declared as `directUrl` in `schema.prisma`.

  Neon's pooler runs PgBouncer in **transaction mode**, which cannot execute the
  session-level statements migrations need. Pointing migrations at the pooled URL
  fails in ways that look like network errors.

- **Transaction-scoped locking still works.** `SELECT … FOR UPDATE` (receipt
  numbering) and unique-insert locking (`JobRun`) are transaction-scoped and are
  unaffected by transaction-mode pooling. **Session-level advisory locks are not
  available** — no design here relies on them, and none should start to.

- **TLS is mandatory.** `sslmode=require` on both URLs; enforced at boot in
  production by the env schema.

- **Cold starts.** A scaled-to-zero branch takes roughly half a second to wake.
  Acceptable at this scale; it is why liveness (`/health`) deliberately does not
  touch the database, so a cold start cannot look like an unhealthy process.

- **Branching replaces a test container.** Integration tests run against a
  dedicated Neon branch rather than a local database, so schema drift between test
  and production is not possible.

Backups are Neon's automated backups plus point-in-time restore. A restore must be
tested before launch — an untested backup is not a backup.

`docker-compose.yml` therefore contains **only MinIO**, so file uploads can be
developed without an AWS account.

### Deployment shape

```
admin.heavenhospitality.in   (static SPA)
api.heavenhospitality.in     (Node process + node-cron)
                             PostgreSQL, S3-compatible storage
```

Mobile talks to the API directly. Single API instance; see
[0006](./0006-idempotency-and-jobs.md) for why jobs remain correct if that ever
becomes two.

### What we deliberately do not have

Redis, BullMQ, Kafka, RabbitMQ, microservices, Kubernetes, Elasticsearch, CQRS,
event sourcing, separate workers, distributed tracing, Prometheus/Grafana, or a
caching tier. At 30 concurrent users PostgreSQL is the whole data layer, including
reporting.

Each of these gets reconsidered only when a **measured** problem demands it.

Security, authorization, input validation, transactions, unique constraints,
concurrency protection, idempotency, audit logging and backups are **not**
overengineering and stay regardless of scale.

### Observability

Pino structured logs with a request id on every request. Sentry is **optional and
environment-gated**: no `SENTRY_DSN` means no Sentry, and local development never
requires it. A `/health` endpoint reports process and database liveness. Nothing
further.

## Divergences from the original brief

`FOUNDATION.md` predates the finalised stack. Where they disagree, this folder wins.

| FOUNDATION.md says            | Actual                    | Why                                   |
| ----------------------------- | ------------------------- | ------------------------------------- |
| NestJS                        | Express 5                 | Finalised stack                       |
| `@nestjs/schedule`            | `node-cron`               | Follows from Express                  |
| `@nestjs/throttler`           | `express-rate-limit`      | Follows from Express                  |
| Next.js admin                 | React + Vite SPA          | Finalised stack                       |
| Phone + OTP auth              | Password auth             | [0003](./0003-auth-and-sessions.md)   |
| `Organization` root entity    | `Property` is the root    | Deferred; see below                   |
| `Building` / `Floor` entities | Fields on `Room`          | No business rule keys off them        |
| Postgres RLS                  | App-layer authorization   | [0004](./0004-authorization.md)       |
| "Guest" as a role             | Absence of authentication | No guest rows, no fake guest accounts |

### Organization is deferred, not designed out

Multi-property already works: every record carries `propertyId`, and staff access
is granted per property via `PropertyMembership`. `Organization` only earns its
place when two unrelated owners share one deployment.

To keep the door open, all property access flows through **one helper**,
`assertPropertyAccess(actor, propertyId)`. Adding an organization later is: one
table, one nullable FK on `Property`, and one extra hop inside that helper — not a
rewrite of every query. Nothing else may resolve property scope on its own.

### Building/Floor are fields, not tables

`Room.floor: Int` and `Room.block: String?`. Nothing bills, allocates, authorizes
or reports at floor level, so two tables, two CRUD surfaces and two joins on every
occupancy query would buy a label. `Room` already carries `propertyId`, so
promoting `block` to a real `Building` table later is a small migration.
