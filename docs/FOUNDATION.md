# Heaven Hospitality — Engineering & Product Foundation

> **Status:** Draft v0.1  
> **Purpose:** Source-of-truth foundation for building the Heaven Hospitality mobile + admin platform with Claude Code.

---

## 1. Product Vision

Heaven Hospitality is a digital operating system for a PG/hostel.

It should help owners and staff operate the property while giving residents a simple mobile app for rent, payments, mess, electricity, attendance, complaints, receipts, and property information.

The product has three experiences:

1. **Admin/Staff experience** — property operations, tenants, occupancy, billing, payments, electricity, mess, complaints, reports and settings.
2. **Tenant experience** — rent, payment, receipts, electricity, mess, leave/meal attendance, complaints and profile.
3. **Guest experience** — an open, unauthenticated area inside the app where a visitor can browse the hostel/property, facilities, rules, pricing and currently available beds.

### Guest / public experience decision

A QR code is **not required for the first version**.

A visitor should be able to download/open the application and access a public guest area without creating an account.

QR-based entry can be added later and should point to the same public property experience rather than creating a second information system.

---

# 2. Core Product Principles

Claude must follow these principles throughout implementation.

### 2.1 Backend is the source of truth

Never trust the mobile app, browser, query parameters, local storage, or client-calculated totals for security-sensitive or financial decisions.

The server must validate:

- identity
- authorization
- tenant/property relationship
- invoice ownership
- payment state
- late-fee calculations
- electricity calculations
- room/bed availability
- complaint ownership
- role permissions

### 2.2 Financial data is immutable by default

Never silently overwrite historical financial records.

Prefer:

- adjustments
- reversals
- refunds
- credit/debit notes
- correction records

over editing a paid invoice or payment in place.

### 2.3 Every important action is auditable

Create an audit trail for actions such as:

- changing rent
- changing due dates
- changing late-fee configuration
- creating/editing invoices
- recording manual payments
- issuing refunds
- assigning/reassigning beds
- checking tenants in/out
- changing user roles
- changing permissions
- changing electricity readings
- resolving/deleting complaints
- changing notification configuration

Audit entries should include actor, action, target entity, timestamp, and relevant before/after information where appropriate.

### 2.4 Idempotency

Any operation that can be retried must be safe to retry.

Especially:

- payments
- payment webhooks
- invoice generation
- late-fee jobs
- notification jobs
- receipt generation
- tenant allocation
- scheduled reminders

### 2.5 Server-side calculations

The client may display calculations for UX, but the server must calculate and persist authoritative financial values.

Examples:

- late fee
- electricity charge
- invoice total
- payable amount
- outstanding amount

### 2.6 Fail safely

If an external provider is unavailable, do not mark the operation successful.

Example:

A payment UI says success but the server cannot verify the payment -> payment remains pending/unverified until verified server-side.

---

# 3. Recommended Technology Stack

> **Architecture rule:** This is a small application. Prefer the smallest reliable stack that satisfies the requirement. Do not add infrastructure for hypothetical scale.

## Mobile

**React Native + Expo + TypeScript**

Recommended libraries/services:

- Expo Router
- TanStack Query
- React Hook Form
- Zod
- Zustand only for local/client state where necessary
- Expo SecureStore for sensitive local credentials/tokens
- Expo Notifications for push notifications
- Native biometric APIs where appropriate

Do not put server state into Zustand unnecessarily. TanStack Query should own server/cache state.

## Admin Web

**Next.js + TypeScript**

Recommended:

- App Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- A consistent component system
- Accessible tables/forms/dialogs
- Charts only where they communicate useful operational information

## Backend

**NestJS + TypeScript**

Use modular architecture:

- Auth
- Users
- Organizations
- Properties
- Buildings
- Floors
- Rooms
- Beds
- Tenants
- Billing
- Payments
- Electricity
- Mess
- Complaints
- Notifications
- Public Property
- Reports
- Audit

Do not create one giant controller/service.

## Database

**PostgreSQL + Prisma**

Use:

- Prisma migrations
- explicit indexes
- foreign keys
- unique constraints
- transactions for multi-step business operations
- decimal/numeric types for money
- timestamps in UTC
- database-level constraints wherever practical

Never use JavaScript floating-point numbers as the authoritative representation of money.

Represent money using integer minor units where practical (e.g. paise) or Prisma Decimal where domain requirements make Decimal preferable. Be consistent.

## Scheduled Jobs

Do **not** add Redis, BullMQ, Kafka, or a separate worker service for the initial version.

The expected usage is small, so scheduled/background work should run inside the NestJS backend using simple scheduled jobs.

Use:

- `@nestjs/schedule`
- PostgreSQL for job state where persistence is required

Use scheduled jobs for:

- rent reminders
- late-fee checks
- monthly invoice generation
- WhatsApp reminders
- push/email notifications

Jobs must still be idempotent so restarting the server or rerunning a task does not create duplicate invoices, late fees, or messages.

If usage grows significantly in the future, Redis/BullMQ can be introduced later without changing the business rules.

## API

REST API initially.

Use:

- versioned API namespace
- DTO validation
- OpenAPI/Swagger
- consistent error response format
- pagination
- filtering
- sorting
- request IDs

Avoid GraphQL unless a real requirement appears.

## File storage

Use object storage such as S3-compatible storage for:

- tenant documents
- complaint images
- property photos
- generated receipts

Never store large binary files directly in PostgreSQL.

Use signed URLs for private files.

## Payments

**Razorpay** is the initial payment provider candidate for India.

Payment architecture must be provider-independent:

`Billing → Payment Order → Provider → Webhook → Server Verification → Payment Record → Receipt`

Never trust the frontend payment callback as the final source of truth.

Razorpay explicitly requires server-side signature verification, and recommends webhooks for server-side payment events. See:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/webhooks/

## WhatsApp

Use an official WhatsApp Business API provider.

Do not automate WhatsApp through unofficial WhatsApp Web/browser automation.

Keep WhatsApp behind a `NotificationProvider` abstraction so the provider can be changed later.

Templates must be treated as versioned external dependencies.

---

# 4. High-Level Architecture

```text
                 ┌──────────────────────────┐
                 │      React Native App    │
                 │ Tenant + Guest Experience │
                 └────────────┬─────────────┘
                              │ HTTPS
                              │
                 ┌────────────▼─────────────┐
                 │       NestJS API         │
                 │                          │
                 │ Auth                     │
                 │ Property                 │
                 │ Tenants                  │
                 │ Billing                  │
                 │ Payments                 │
                 │ Electricity              │
                 │ Mess                     │
                 │ Complaints               │
                 │ Notifications            │
                 │ Public Property          │
                 │ Audit                    │
                 └────────────┬─────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
             ┌──────▼──────┐     ┌──────▼──────┐
             │ PostgreSQL  │     │ Object      │
             │ + Prisma    │     │ Storage     │
             └─────────────┘     └─────────────┘

                    External Services
                    ┌─────┼─────┐
                 WhatsApp Email Push

                 ┌──────────────────────────┐
                 │        Next.js Admin     │
                 └──────────────────────────┘
```

---

# 5. Multi-Property Model

Design the database so one owner/account can eventually manage multiple properties.

Recommended hierarchy:

```text
Organization
  └── Property
       └── Building
            └── Floor
                 └── Room
                      └── Bed
```

Do not hard-code a single hostel.

Every business record that belongs to a property must have a clear property/organization relationship.

This allows future SaaS expansion without rewriting the data model.

---

# 6. Roles & Authorization

Initial roles:

### Owner

Full access.

### Manager

Operational access based on assigned permissions.

### Staff

Restricted operational access.

### Tenant

Only their own tenant-related data.

### Guest

Only explicitly public property information.

Authorization must be enforced on the backend.

Never rely on hiding buttons/screens to enforce permissions.

The frontend should hide unavailable actions for UX, but the API must reject unauthorized requests independently.

Use a combination of RBAC and resource ownership.

Example:

A tenant may have permission to read invoices, but only invoices belonging to that tenant.

---

# 7. Core Domains

## Property

Entities:

- Organization
- Property
- Building
- Floor
- Room
- Bed

Bed statuses:

- AVAILABLE
- OCCUPIED
- RESERVED
- MAINTENANCE
- BLOCKED

Never allow two active tenants to occupy the same bed.

Use database constraints/transactions to protect allocation.

## Tenant

Tenant lifecycle:

```text
LEAD
→ APPLICATION
→ APPROVED
→ ACTIVE
→ NOTICE_PERIOD
→ VACATED
```

Store allocation history rather than overwriting room/bed history.

Tenant information may include:

- name
- phone
- email
- emergency contact
- profile image
- documents
- room
- bed
- rent plan
- security deposit
- joining date
- notice date
- expected exit date

Sensitive documents must be private.

## Billing

Core entities:

- RentPlan
- Invoice
- InvoiceItem
- Payment
- Receipt
- Adjustment
- Refund
- LateFeeRule

Example invoice:

```text
Monthly Rent       ₹8,000
Electricity          ₹910
Other Charge         ₹200
Late Fee             ₹300
--------------------------
Total              ₹9,410
```

Invoice items should identify their source.

Do not hide arbitrary charges inside a single total.

### Late fee

Initial rule:

- configured due date
- configurable grace period
- configurable amount per day
- no fee before the allowed date
- fee calculated based on overdue days

Do not hard-code ₹100/day.

The server must calculate late fees.

Late-fee jobs must be idempotent.

Do not create duplicate late-fee records every time the scheduler runs.

## Electricity

Entities:

- Meter
- MeterReading
- ElectricityBill

Calculation:

```text
units = currentReading - previousReading
charge = units × configuredRate
```

Validate:

- current reading cannot normally be lower than previous reading
- duplicate readings are rejected
- meter/room relationships are valid
- rate is versioned/configurable

Meter reading corrections must be auditable.

## Mess

Entities:

- Menu
- MenuItem
- Meal
- MealAttendance
- MealPreference/Absence

Meals:

- Breakfast
- Lunch
- Dinner

The operational goal is to determine expected meal counts.

Example:

```text
Breakfast: 73
Lunch: 82
Dinner: 79
```

The system should handle:

- tenant absence
- late changes
- duplicate submissions
- cutoff times
- timezone
- missed submissions
- admin corrections

## Complaints

Categories:

- Plumbing
- Electrical
- Carpentry
- Wi-Fi
- Cleaning
- AC
- Furniture
- Other

Statuses:

```text
OPEN
ASSIGNED
IN_PROGRESS
RESOLVED
CLOSED
REOPENED
```

Store status history.

A tenant should be able to see their own complaint history.

Staff should only see complaints they are authorized to access.

Attachments should be validated by file type and size.

## Notifications

Central notification system.

Channels:

- In-app
- Push
- WhatsApp
- Email

Notification records should include:

- recipient
- channel
- template
- status
- provider message ID
- retry count
- timestamps
- failure reason

For this scale, a simple notification table plus scheduled retry logic is enough.

Do not introduce a dedicated queue system initially. Prevent duplicate notifications with a unique business key or equivalent idempotency rule where necessary.

## Public / Guest Property

Guest area is unauthenticated.

It may show:

- property name
- description
- facilities
- rules
- room types
- pricing
- available beds
- photos
- food/menu information
- contact details
- location
- inquiry/contact action

Do not expose:

- tenant names
- tenant phone numbers
- private documents
- internal staff data
- exact private operational information
- internal complaint data
- private payment information

Availability shown publicly should be intentionally coarse enough to avoid privacy/security problems.

QR can later point to the same public property route.

---

# 8. Mobile Navigation

Tenant:

```text
Home
Rent
Payments
Electricity
Mess
Complaints
Profile
```

Guest:

```text
Explore
Rooms
Facilities
Rules
Food
Contact
```

Do not require guest authentication.

Do not create fake guest accounts just to display public information.

---

# 9. Admin Navigation

```text
Dashboard

Property
  Buildings
  Floors
  Rooms
  Beds

Tenants

Billing
  Invoices
  Payments
  Receipts
  Outstanding

Electricity

Mess

Complaints

Notifications

Reports

Settings
  Property
  Rent Rules
  Electricity
  Mess
  Staff
  Permissions
  Integrations
```

Dashboard should prioritize operational information rather than decorative KPI cards.

Useful dashboard information:

- occupancy
- available beds
- upcoming vacancies
- outstanding rent
- overdue invoices
- today's meal counts
- unresolved complaints
- electricity readings pending
- recent payments
- operational alerts

---

# 10. Security Requirements

Use OWASP MASVS as the mobile-security baseline and OWASP ASVS concepts for the backend.

OWASP MASVS covers storage, cryptography, authentication/authorization, network communication, platform interaction, code quality, resilience and privacy.

References:

- https://mas.owasp.org/MASVS/
- https://mas.owasp.org/MASVS/07-MASVS-AUTH/
- https://mas.owasp.org/MASVS/05-MASVS-STORAGE/
- https://mas.owasp.org/MASVS/08-MASVS-NETWORK/

## Authentication

Implement secure authentication.

Potential initial flow:

```text
Phone number
→ OTP
→ Verify
→ Access token/session
```

Do not implement OTP with insecure custom cryptography.

Requirements:

- OTP expiry
- limited attempts
- resend cooldown
- rate limiting
- brute-force protection
- session/token rotation where appropriate
- logout/revocation strategy
- device/session management
- optional biometric app lock

Do not store raw OTPs.

Store a short-lived hash or use a trusted OTP provider.

## Token storage

Never store access/refresh tokens in AsyncStorage.

Use OS-protected secure storage.

Expo SecureStore is the preferred initial approach for sensitive local credentials.

OWASP specifically requires sensitive data to be securely stored and protected from accidental leakage.

## Secrets

Never commit:

- database passwords
- JWT secrets
- payment secrets
- WhatsApp credentials
- storage credentials
- API keys
- private keys

Use environment variables locally and a proper secret manager in production.

Never expose server secrets through the mobile bundle.

Anything shipped inside a mobile application should be considered discoverable by an attacker.

## Network

Production API must use HTTPS.

Do not disable TLS verification.

Do not accept arbitrary certificates.

Do not send sensitive data through query strings when a body/header is appropriate.

Never log:

- passwords
- OTPs
- access tokens
- refresh tokens
- payment secrets
- private documents
- full payment credentials

OWASP MASVS recommends secure network communication and protecting remote endpoint identity.

## API security

Implement:

- DTO validation
- strict schemas
- input sanitization
- rate limiting
- authentication guards
- authorization guards
- pagination limits
- request body limits
- file upload limits
- CORS allowlist
- security headers
- request IDs
- structured audit logging

NestJS provides rate-limiting support through `@nestjs/throttler`.

Reference:
https://docs.nestjs.com/security/rate-limiting

## IDOR protection

Never trust IDs supplied by clients.

Bad:

```text
GET /tenants/123/invoices
```

and blindly return invoice 123.

Correct:

```text
authenticated user
+
authorized property
+
tenant ownership
+
requested resource
```

must all be checked.

Use authorization at the service/domain layer, not only in controllers.

## Database security

Use:

- parameterized queries through Prisma
- least-privilege DB credentials
- encrypted production database connections
- regular backups
- migration discipline
- database constraints
- indexes
- transaction boundaries

PostgreSQL Row-Level Security can provide an additional defense-in-depth layer for multi-tenant data, although application authorization remains mandatory.

Reference:
https://www.postgresql.org/docs/current/ddl-rowsecurity.html

## File security

For uploaded documents/images:

- validate MIME type
- validate extension
- validate file signature where appropriate
- enforce size limits
- randomize storage names
- never execute uploaded files
- private files use signed URLs
- virus/malware scanning can be added
- prevent path traversal
- strip sensitive metadata where appropriate

## Privacy

Collect only information actually needed.

Tenant data is sensitive.

Do not expose tenant information on the public guest experience.

Implement:

- privacy policy
- data retention rules
- account deletion/deactivation strategy
- document retention policy
- auditability for sensitive access

## Logging

Use structured logs.

Each request should have a correlation/request ID.

Security logs should capture events such as:

- login success/failure
- OTP abuse
- permission denial
- suspicious request patterns
- payment verification failures
- webhook failures
- administrative changes

Never log secrets or unnecessary personal information.

---

# 11. Payment Security

Payment is one of the highest-risk modules.

Never:

- trust frontend success state
- mark invoice paid from client callback alone
- accept client-provided amount as authoritative
- expose payment provider secret
- process the same webhook twice

Payment flow:

```text
Tenant
  ↓
Request payment
  ↓
Backend calculates payable amount
  ↓
Backend creates provider order
  ↓
Client opens payment UI
  ↓
Provider processes payment
  ↓
Provider callback/webhook
  ↓
Backend verifies signature
  ↓
Backend verifies payment/order state
  ↓
Transactionally update payment + invoice
  ↓
Generate receipt
  ↓
Queue notification
```

Razorpay explicitly documents server-side signature verification and recommends webhooks for server-side payment events.

References:

- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/webhooks/
- https://razorpay.com/docs/webhooks/validate-test/

Webhook handlers must be:

- signature verified
- idempotent
- transaction-safe
- retry-safe

---

# 12. Critical Business Edge Cases

Claude must actively consider these instead of implementing only the happy path.

## Tenant / Bed

- tenant leaves early
- tenant changes room
- tenant changes bed
- bed becomes unavailable during allocation
- two admins allocate same bed simultaneously
- tenant has notice period
- future reservation
- maintenance bed
- cancelled reservation

## Billing

- tenant joins mid-month
- tenant leaves mid-month
- prorated rent
- rent changes
- discount
- manual adjustment
- late payment
- partial payment
- failed payment
- duplicate payment
- refund
- payment after invoice is marked overdue
- payment webhook arrives twice
- webhook arrives late
- payment provider unavailable

## Late Fee

- due date timezone
- grace period
- payment made on due date
- payment made one minute after due date
- partial payment
- partial outstanding amount
- late fee already generated
- admin waives late fee
- invoice regenerated

## Electricity

- missing previous reading
- lower current reading
- duplicate reading
- meter replacement
- room change
- incorrect reading
- corrected reading after invoice generation
- electricity rate change

## Mess

- tenant does not submit attendance
- tenant changes absence after cutoff
- duplicate attendance
- holiday
- kitchen closed
- tenant joins halfway through day
- tenant checks out
- meal count correction by staff

## Complaints

- duplicate complaint
- complaint reopened
- staff reassignment
- attachment deleted
- tenant tries to access another tenant's complaint
- staff tries to access unauthorized property
- complaint resolved without comment
- notification failure

## Notifications

- duplicate notification
- provider outage
- invalid phone number
- WhatsApp template unavailable
- push token expired
- user opted out
- retry storm
- provider rate limit

## Public Guest

- property has zero available beds
- property temporarily closed
- stale availability
- property deleted/deactivated
- invalid property slug
- sensitive information accidentally exposed
- public API scraping

---

# 13. Concurrency Requirements

This application has real-world race conditions.

Protect operations such as:

### Bed allocation

Two staff members must not be able to allocate the same bed simultaneously.

### Payment processing

Two webhook events must not create duplicate payments.

### Invoice generation

A scheduler retry must not generate duplicate invoices.

### Late fee

Running the late-fee worker twice must not double-charge the tenant.

### Mess attendance

Duplicate client requests must not create duplicate attendance.

Use:

- database transactions
- unique constraints
- idempotency keys
- appropriate locking/isolation where necessary

---

# 14. API Design Rules

All APIs must:

- validate input
- authenticate when required
- authorize resource access
- return consistent errors
- paginate large collections
- never expose unnecessary fields
- avoid leaking internal database structure
- use DTOs
- use explicit response types

Example:

```text
GET    /api/v1/properties
GET    /api/v1/properties/:id
GET    /api/v1/rooms
GET    /api/v1/beds
POST   /api/v1/beds/:id/allocate
GET    /api/v1/tenants/me/invoices
POST   /api/v1/invoices/:id/payment-order
POST   /api/v1/payments/webhooks/razorpay
POST   /api/v1/complaints
PATCH  /api/v1/complaints/:id/status
GET    /api/v1/public/properties/:slug
```

Exact endpoints should be finalized after the domain model is designed.

---

# 15. Database Rules

Use PostgreSQL.

Every important table should have:

- UUID or appropriately non-guessable primary identifier
- createdAt
- updatedAt

Soft deletion should be used selectively, not automatically everywhere.

For historical financial/operational records, prefer status transitions and audit records over destructive deletion.

Use indexes based on actual query patterns.

Important indexes will likely include:

- propertyId
- tenantId
- roomId
- bedId
- invoice status
- due date
- payment status
- complaint status
- createdAt

Use unique constraints for business invariants.

---

# 16. Money Rules

Never use binary floating-point for financial calculations.

Use:

- integer paise, or
- Decimal

Be consistent.

Currency should be explicit.

Initial currency:

`INR`

Examples:

```text
₹100 = 10000 paise
```

Rounding rules must be explicitly defined.

Never rely on JavaScript:

```text
0.1 + 0.2
```

for authoritative financial calculations.

---

# 17. Date & Time Rules

Store timestamps in UTC.

Display dates/times in the property's configured timezone.

Initial default timezone:

`Asia/Kolkata`

Business rules such as:

- rent due date
- late fee start
- mess cutoff
- reminder time

must use the property timezone.

Never mix device local time with server business time.

---

# 18. Mobile UX Rules

The tenant app is mobile-first.

Prioritize:

- fast loading
- clear hierarchy
- minimal taps
- readable typography
- obvious primary actions
- offline-friendly cached reads where useful
- graceful network failure
- loading states
- empty states
- retry states
- accessible touch targets

Do not build desktop UI squeezed into a phone.

For important actions, clearly communicate:

- what will happen
- amount involved
- current status
- next action

---

# 19. Admin UX Rules

Admin is desktop-first but should remain usable on smaller screens.

Avoid:

- dashboard card overload
- excessive gradients
- decorative charts
- giant empty spaces
- inconsistent forms
- modal-heavy workflows
- tables with no filtering/search
- hidden actions
- unclear destructive actions

Prefer:

- information hierarchy
- dense but readable data tables
- search/filter/sort
- bulk actions where useful
- contextual actions
- clear status badges
- confirmation for destructive operations
- good empty states
- keyboard accessibility

---

# 20. Design System

Create a reusable design system before building dozens of screens.

Define:

- typography
- spacing scale
- radius
- shadows
- colors
- semantic colors
- buttons
- inputs
- selects
- date pickers
- tables
- cards
- badges
- dialogs
- bottom sheets
- toast
- skeletons
- empty states
- error states
- navigation
- charts

Do not hard-code random visual values per screen.

Use design tokens.

The visual language should feel like one product across admin and mobile.

---

# 21. Accessibility

Target WCAG-style accessibility principles.

Requirements include:

- sufficient contrast
- semantic labels
- screen reader support
- keyboard navigation for web
- accessible touch targets
- meaningful error messages
- focus states
- no color-only status communication

---

# 22. Testing Strategy

Do not rely only on manual testing.

## Unit tests

Test:

- late fee calculation
- electricity calculation
- invoice totals
- proration
- authorization rules
- status transitions

## Integration tests

Test:

- invoice creation
- payment processing
- webhook processing
- bed allocation
- complaint workflows
- notification queues

## E2E tests

Critical flows:

### Tenant

```text
Login
→ View invoice
→ Pay
→ Payment verified
→ Receipt available
```

### Admin

```text
Create property
→ Create room
→ Create bed
→ Add tenant
→ Allocate bed
→ Generate invoice
```

### Complaint

```text
Tenant creates complaint
→ Staff receives notification
→ Staff assigns
→ Status changes
→ Tenant sees update
```

### Mess

```text
Tenant marks absence
→ Meal counts update
→ Admin sees expected count
```

### Public

```text
Guest opens property
→ Sees facilities
→ Sees availability
→ Sees contact information
```

---

# 23. CI/CD

Use GitHub Actions.

Minimum pipeline:

```text
Pull Request
    ↓
Lint
    ↓
Typecheck
    ↓
Unit tests
    ↓
Integration tests
    ↓
Build
```

Do not allow merging if required checks fail.

For production:

```text
main
 ↓
CI
 ↓
Build
 ↓
Deploy
 ↓
Migration strategy
 ↓
Health check
```

Database migrations must be handled deliberately.

Never casually reset production databases.

---

# 24. Environment Management

At minimum:

```text
.env.example
.env.local
.env.test
production secrets
```

Never commit actual credentials.

Separate:

- development
- staging
- production

Payment providers must have test/live environments.

---

# 25. Error Handling

Create a consistent error model.

Example:

```json
{
  "success": false,
  "error": {
    "code": "BED_ALREADY_ALLOCATED",
    "message": "This bed is no longer available.",
    "requestId": "..."
  }
}
```

Do not expose:

- stack traces
- SQL errors
- internal service details
- secrets

in production responses.

---

# 26. Observability

Keep observability lightweight.

Production should have:

- structured application logs
- error tracking such as Sentry
- request IDs for important API requests
- payment webhook error logging
- scheduled-job error logging
- database health checks
- a simple `/health` endpoint

Do **not** introduce Prometheus, Grafana, distributed tracing, queue dashboards, or a dedicated monitoring stack initially.

Useful alerts:

- repeated payment webhook failures
- scheduled job failures
- database connectivity problems
- high application error rate

---

# 27. Backup & Recovery

PostgreSQL production database must have:

- automated backups
- retention policy
- point-in-time recovery where supported
- tested restore procedure

A backup that has never been restored/tested should not be considered a reliable backup strategy.

---

# 28. Security Checklist Before Production

Before launch, verify:

- [ ] HTTPS everywhere
- [ ] Secrets not in repository
- [ ] Production secrets rotated
- [ ] Authentication tested
- [ ] Authorization tested
- [ ] IDOR tests completed
- [ ] Rate limiting enabled
- [ ] OTP abuse protection enabled
- [ ] Input validation enabled
- [ ] File uploads restricted
- [ ] Private files protected
- [ ] Payment signatures verified server-side
- [ ] Payment webhooks verified
- [ ] Webhooks idempotent
- [ ] Sensitive logs removed
- [ ] Database backups configured
- [ ] Restore tested
- [ ] Dependency vulnerabilities reviewed
- [ ] Production CORS restricted
- [ ] Error responses sanitized
- [ ] Audit logs enabled
- [ ] Admin permissions reviewed
- [ ] Tenant data isolation tested
- [ ] Public API checked for data leakage

---

# 29. Scale & Simplicity Constraints

The expected initial scale is small:

- roughly tens of users, not thousands
- around 30 simultaneous users in a worst-case scenario
- a small number of properties
- a small operations team

Architecture must reflect this reality.

### Do not introduce initially

- microservices
- Redis
- BullMQ
- Kafka
- RabbitMQ
- Kubernetes
- service mesh
- event sourcing
- CQRS unless a concrete requirement demands it
- separate worker servers
- Elasticsearch
- dedicated analytics database
- Prometheus/Grafana stack
- distributed tracing
- complex caching infrastructure
- premature horizontal scaling

### Prefer

```text
React Native
      │
Next.js Admin
      │
      ▼
Single NestJS API
      │
      ▼
PostgreSQL
```

plus object storage and only the external services actually required.

The backend can handle API requests, scheduled tasks, notification triggers and payment webhooks in the same application.

For this expected load, PostgreSQL is more than sufficient for primary data access and most reporting.

### When to add more infrastructure

Add another system only after there is a measurable problem it solves.

- Redis → only if caching/session/job requirements become real
- BullMQ → only if background job volume/reliability exceeds simple scheduled processing
- separate workers → only if jobs materially interfere with API responsiveness
- search engine → only if PostgreSQL search becomes insufficient
- Kubernetes → only if deployment scale genuinely requires orchestration

Security and correctness are **not** overengineering. Authentication, authorization, transaction safety, input validation, backups, payment verification and auditability should remain even at 30 users.

---

# 30. Development Rules for Claude

Claude must not blindly generate the entire application in one pass.

Before implementation:

1. Inspect the repository.
2. Read this document.
3. Create/maintain architecture documentation.
4. Identify ambiguities.
5. Propose the implementation plan.
6. Build in coherent vertical slices.
7. Run tests after each slice.
8. Fix errors before continuing.
9. Keep database migrations clean.
10. Keep commits focused.

Do not rewrite working code unnecessarily.

Do not introduce a dependency unless it solves a real problem.

Prefer simple, maintainable architecture over premature abstraction.

Do not create generic abstractions for hypothetical future requirements.

---

# 31. Claude Must Never Do These

Never:

- hard-code secrets
- trust client-side authorization
- trust client-side payment success
- store tokens in insecure local storage
- use floating point for money
- expose private tenant data publicly
- use unofficial WhatsApp automation
- disable TLS verification
- disable certificate validation to "fix" a development issue
- commit `.env` secrets
- silently delete financial records
- silently modify paid invoices
- create duplicate payments
- create duplicate late fees
- create duplicate invoices
- use random colors/components per page
- create fake loading states without real data handling
- swallow exceptions
- leave TODO security holes in production paths

---

# 32. Future-Ready, But Not Overengineered

Potential future features:

- multi-property SaaS
- online tenant applications
- digital agreements
- e-signatures
- visitor management
- gate/security management
- inventory
- staff attendance
- payroll
- laundry management
- automated rent collection
- UPI AutoPay
- advanced analytics
- owner mobile app
- QR check-in
- referral/lead management

Do not implement these unless required.

The architecture should not prevent them, but the MVP should remain focused.

---

# 33. Initial Repository Direction

Recommended monorepo:

```text
heaven-hospitality/
│
├── apps/
│   ├── mobile/
│   └── admin/
│
├── services/
│   └── api/
│
├── packages/
│   ├── types/
│   ├── validation/
│   ├── config/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── docs/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Use **pnpm workspaces** if keeping mobile, admin and API in one repository.

Do not add Turborepo initially unless build times or workspace complexity actually become a problem. Do not create separate worker services, microservices or infrastructure packages for the MVP.

---

# 34. Recommended Initial Build Order

Do not start with payments or WhatsApp.

Build the domain foundation first.

```text
01. Repository + tooling
02. Database + Prisma
03. Authentication
04. Organization + Property
05. Building + Floor + Room + Bed
06. Tenant management
07. Tenant ↔ Bed allocation
08. Billing + invoices
09. Electricity
10. Mess
11. Complaints
12. Tenant mobile experience
13. Admin dashboard
14. Public guest experience
15. Payments
16. Notifications
17. WhatsApp
18. Reports
19. Security hardening
20. Production deployment
```

Payments and WhatsApp come after the underlying business entities are stable.

---

# 35. Definition of Done

A feature is not complete because the screen exists.

A feature is complete only when it has:

- database model
- migration
- backend service
- API
- validation
- authorization
- error handling
- loading state
- empty state
- mobile/web UI where applicable
- tests
- audit considerations
- notification behavior where applicable
- documentation where necessary

---

# 36. Final Product Standard

The goal is not:

> "An AI-generated hostel management app."

The goal is:

> **A reliable property-management product that a real hostel owner could trust with tenants, money, occupancy and daily operations.**

Claude should optimize for:

1. correctness
2. security
3. maintainability
4. usability
5. performance
6. visual quality

in that order.

When there is a conflict between visual convenience and security/correctness, security/correctness wins.

When there is a conflict between complexity and a simpler reliable implementation, prefer the simpler implementation.

---

# 37. Research References

Security baseline:

- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP Mobile Authentication: https://mas.owasp.org/MASVS/07-MASVS-AUTH/
- OWASP Mobile Storage: https://mas.owasp.org/MASVS/05-MASVS-STORAGE/
- OWASP Mobile Network Security: https://mas.owasp.org/MASVS/08-MASVS-NETWORK/

Backend:

- NestJS rate limiting: https://docs.nestjs.com/security/rate-limiting
- PostgreSQL Row-Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Prisma: https://www.prisma.io/docs

Payments:

- Razorpay payment verification: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- Razorpay webhooks: https://razorpay.com/docs/webhooks/
- Razorpay webhook validation: https://razorpay.com/docs/webhooks/validate-test/

---

# 38. Next Planning Step

Do **not** start implementation directly from this document.

Next, create the detailed domain specification:

1. Complete database entities and relationships
2. User roles and exact permissions
3. All application screens/routes
4. All major user workflows
5. Billing rules
6. Electricity rules
7. Mess rules
8. Complaint rules
9. Notification rules
10. Payment lifecycle
11. Public guest experience
12. API boundaries

That specification becomes the next source of truth before Claude writes production code.
