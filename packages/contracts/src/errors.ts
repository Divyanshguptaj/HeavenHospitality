/**
 * Every error the API can return, as a closed set.
 *
 * Clients switch on `code`, never on `message` — messages are for humans and may
 * be reworded or localised at any time. Adding a code here is a deliberate API
 * change that both clients can see in their types.
 */
export const ERROR_CODES = [
  // Request / validation
  'VALIDATION_FAILED',
  'MALFORMED_JSON',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',

  // Authentication
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_INACTIVE',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'SESSION_REVOKED',

  // Authorization
  'FORBIDDEN',
  'INSUFFICIENT_PERMISSION',

  // Resources — note that an unauthorized resource also returns NOT_FOUND,
  // so that existence is never confirmed to someone who may not see it.
  'NOT_FOUND',
  'CONFLICT',
  'ALREADY_EXISTS',

  // Occupancy
  'BED_ALREADY_ALLOCATED',
  'BED_UNAVAILABLE',
  'TENANCY_NOT_ACTIVE',

  // Billing and payments
  'INVOICE_NOT_PAYABLE',
  'INVOICE_ALREADY_ISSUED',
  'AMOUNT_MISMATCH',
  'PAYMENT_VERIFICATION_FAILED',
  'PAYMENT_ALREADY_RECORDED',
  'REFUND_NOT_ALLOWED',
  'SETTLEMENT_REQUIRED',

  // Metering and mess
  'READING_BELOW_PREVIOUS',
  'READING_ALREADY_EXISTS',
  'MESS_CUTOFF_PASSED',

  // Infrastructure
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status for each error code. The API never picks a status ad hoc. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  VALIDATION_FAILED: 400,
  MALFORMED_JSON: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,

  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_INACTIVE: 403,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  SESSION_REVOKED: 401,

  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSION: 403,

  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_EXISTS: 409,

  BED_ALREADY_ALLOCATED: 409,
  BED_UNAVAILABLE: 409,
  TENANCY_NOT_ACTIVE: 409,

  INVOICE_NOT_PAYABLE: 409,
  INVOICE_ALREADY_ISSUED: 409,
  AMOUNT_MISMATCH: 400,
  PAYMENT_VERIFICATION_FAILED: 400,
  PAYMENT_ALREADY_RECORDED: 409,
  REFUND_NOT_ALLOWED: 409,
  SETTLEMENT_REQUIRED: 409,

  READING_BELOW_PREVIOUS: 400,
  READING_ALREADY_EXISTS: 409,
  MESS_CUTOFF_PASSED: 409,

  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
});
