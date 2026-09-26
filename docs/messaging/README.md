# Messaging and notifications

Principle: **the right message, on the right channel, at the right time.** Push is the default (free). WhatsApp (paid) is used only for the two rent reminders that must reach a resident who has not opened the app. SMS (paid) is used only for OTPs.

## Architecture

```
business code ──> notify() / notifyOwners() / notifyResidents()      modules/notifications/notification.service.ts
                    │  events.ts: who, which channels, wording, mutable or not
                    ├─ PushProvider     ExpoPushProvider              providers/push.provider.ts
                    └─ WhatsappProvider Mock | Fast2smsWhatsapp       providers/whatsapp.provider.ts
                                          └─ fast2sms.client.ts       (only file that knows Fast2SMS HTTP)
OTP ──> otp.service ──> OtpProvider  Mock | SmsOtpProvider (Fast2SMS DLT SMS)   modules/auth/otp.provider.ts
```

- `notify` **never throws.** A failed message never rolls back a payment, complaint update or room assignment; the failure is recorded on the delivery row.
- OTP delivery is different by design: a send failure is reported to the user, because the flow cannot continue without the code. Expiry, attempt limits, resend cooldown and rate limits live in `otp.service.ts` and are unchanged.
- No Redis or queue: `node-cron` in the API process plus PostgreSQL rows.

## Event → channel matrix

| Event | Recipient | Channel | Can be muted |
|---|---|---|---|
| Signup / reset OTP | user | SMS | no |
| Rent due in 3 days (`RENT_DUE_SOON`) | resident | Push | no |
| Rent due today (`RENT_DUE_TODAY`) | resident | Push + WhatsApp | no |
| Rent overdue, days 1, 3, 7, then every 7th (`RENT_OVERDUE`) | resident | Push; WhatsApp too on day 3 only | no |
| New bill on the 1st (`INVOICE_GENERATED`) | resident | Push | no |
| Payment received (`PAYMENT_RECEIVED`) | resident | Push | no |
| Room assigned / move-out (`ROOM_ASSIGNED`, `MOVED_OUT`) | resident | Push | no |
| Password changed / reset (`PASSWORD_CHANGED`) | user | Push | no |
| Complaint status changed | resident | Push | yes (`COMPLAINTS`) |
| Notice posted | residents | Push | yes (`NOTICES`) |
| New complaint (`COMPLAINT_CREATED`) | owner | Push | yes (`COMPLAINTS`) |
| Admission form submitted (`APPLICANT_SUBMITTED`) | owner | Push | no |

Deliberately **not** sent: menu changes and meal-absence confirmations (low value), payment-failed (the app already shows the error), deposit invoices in rent reminders (a deposit is not rent).

Rent and AC bill are separate invoices for the same month, so reminders are grouped per resident and month into one message with the combined balance.

## Delivery tracking and duplicates

`NotificationDelivery` records event, user, channel, provider, status (`PENDING/SENT/DELIVERED/FAILED/SKIPPED`), provider message id, attempts and error. It never stores message text. It is unique on `(dedupeKey, channel)`; the key is `EVENT:userId:logicalKey` (e.g. `RENT_DUE_TODAY:<user>:<tenancy>:2026-09`), so a restarted cron cannot resend. A failed send is not retried automatically (bounded by design); the overdue reminder recurs on its own schedule.

Question "did we send Rahul's reminder?" → `SELECT * FROM "NotificationDelivery" WHERE "userId" = … ORDER BY "createdAt" DESC`.

## Expo push

- Mobile (`src/lib/pushNotifications.ts`): asks permission, creates the Android `default` channel, registers the Expo token at `POST /me/devices` after sign-in, unregisters at sign-out, shows banners in the foreground, and opens `data.route` when a notification is tapped (including from a cold start).
- Server: tokens live in `DeviceToken` (several per user). Expo tickets are stored on the delivery row; `reconcilePushReceipts` runs every 15 minutes, marks `DELIVERED`/`FAILED`, and disables tokens Expo reports as `DeviceNotRegistered`.
- **Needs a new dev/production build**: `expo-notifications` is a native module. Push does not work in Expo Go on Android, and needs a physical device. Older builds skip registration silently.
- Preferences: `GET/PUT /me/devices/preferences` (`mutedCategories`: `COMPLAINTS`, `NOTICES`). There is no settings screen in the app yet.

## Fast2SMS setup (what you must do)

Verified against docs.fast2sms.com: SMS is `GET https://www.fast2sms.com/dev/bulkV2?route=dlt&sender_id=…&message=<template id>&variables_values=a|b&numbers=<10 digits>`; WhatsApp is `GET https://www.fast2sms.com/dev/whatsapp?message_id=…&phone_number_id=…&numbers=…&variables_values=a|b`; both send the API key in an `authorization` header.

1. Create a Fast2SMS account and copy the **API key** (Dev API section) → `FAST2SMS_API_KEY`.
2. **DLT registration** (TRAI requirement for SMS in India; Fast2SMS offers DLT help): register the business entity, a **sender header** (3–6 letters) → `FAST2SMS_SENDER_ID`, and an **OTP template** such as `Your Heaven Hospitality verification code is {#var#}. Do not share it with anyone.` Once approved, copy its **message id** from the DLT manager → `FAST2SMS_OTP_TEMPLATE_ID`. The code is the single variable.
3. **WhatsApp Business API onboarding** in Fast2SMS (needs a business number and Meta business verification). Note the **phone number id** → `FAST2SMS_WHATSAPP_PHONE_NUMBER_ID`.
4. Submit the two templates in `WHATSAPP_TEMPLATES.md`; when approved, copy each **message id** → `FAST2SMS_WA_RENT_DUE_MESSAGE_ID`, `FAST2SMS_WA_RENT_OVERDUE_MESSAGE_ID`. Variable order must match the document.
5. Production: set `OTP_PROVIDER=sms`, `MESSAGING_PROVIDER=fast2sms`. The API refuses to boot in production with anything missing.

**Not verified / uncertain**: Fast2SMS does not document its error body shape, so failures are detected by HTTP status plus the `return`/`status` flag and reported as a generic delivery error. Webhook delivery reports for SMS/WhatsApp are not consumed; those rows stay `SENT`. Nothing was tested against the live Fast2SMS API.

## Development

`MESSAGING_PROVIDER=mock` (default) logs `[MOCK WHATSAPP] not sent` with the event and a masked number; no template variables are logged. `OTP_PROVIDER=mock` logs the OTP for development only and cannot run in production (existing double guard). `OTP_DEV_FIXED_CODE` is refused in production. Tests stub `fetch` and every provider, so they never send anything.

## Testing manually

1. Sign in on a physical device with a new build; check `DeviceToken` has a row.
2. Record a payment as the owner → the resident gets a push; check `NotificationDelivery`.
3. Rent reminders: `jobsForTesting.createRentReminders('<date>')` against a seeded invoice.

## Troubleshooting

- No push, delivery `SKIPPED` / "no registered device": the app has not registered (old build, permission denied, emulator).
- Delivery `FAILED` with `DeviceNotRegistered`: the token was retired; it re-registers on next sign-in.
- SMS OTP "not configured": one of `FAST2SMS_SENDER_ID` / `FAST2SMS_OTP_TEMPLATE_ID` is unset.
- Fast2SMS `FAILED (4xx)`: template id or variable count does not match the approved template.

## Cost-sensitive decisions

WhatsApp is limited to two sends per unpaid month per resident (due day, overdue day 3). Payment confirmations, invoices, complaints and everything else are push-only. Roughly 50 residents → about 100 paid WhatsApp messages a month at most, plus one SMS per OTP.
