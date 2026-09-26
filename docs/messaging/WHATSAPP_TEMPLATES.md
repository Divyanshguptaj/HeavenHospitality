# WhatsApp templates to submit

Category for both: **Utility**. Create them in the Fast2SMS WhatsApp panel (which submits to Meta). Variables must be in exactly this order. Keep the wording; do not add the resident's contact details or bank information.

## 1. Rent due today

- Internal event: `RENT_DUE_TODAY` (template `RENT_DUE`)
- Template name: `rent_due_reminder`
- Env var for its Fast2SMS message id: `FAST2SMS_WA_RENT_DUE_MESSAGE_ID`
- Variables: `{{1}}` resident name, `{{2}}` billing month, `{{3}}` amount, `{{4}}` due date
- Example:
  > Hi Rahul, your Heaven Hospitality bill for September 2026 of ₹7,500 is due on 2026-09-05. Please open the app to view your bill.

## 2. Rent overdue

- Internal event: `RENT_OVERDUE` (template `RENT_OVERDUE`), sent once, on day 3 overdue
- Template name: `rent_overdue_reminder`
- Env var: `FAST2SMS_WA_RENT_OVERDUE_MESSAGE_ID`
- Variables: `{{1}}` resident name, `{{2}}` billing month, `{{3}}` amount, `{{4}}` days overdue
- Example:
  > Hi Rahul, your Heaven Hospitality bill for September 2026 of ₹7,500 is 3 days overdue. Please pay in the app or contact the manager.

## SMS (DLT) template — OTP

Registered on the DLT portal, not WhatsApp. One variable:

> Your Heaven Hospitality verification code is {#var#}. Do not share it with anyone.
