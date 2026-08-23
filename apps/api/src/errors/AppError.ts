import { ERROR_STATUS, type ErrorCode } from '@heaven/contracts';

export interface ErrorDetail {
  readonly path: string;
  readonly message: string;
}

/**
 * An expected, handled failure — the API's own vocabulary of things that can go
 * wrong. Anything that is *not* an `AppError` reaching the error handler is a bug,
 * and is reported as `INTERNAL_ERROR` with no detail.
 *
 * The HTTP status comes from the code, so a status is never chosen ad hoc at a
 * throw site.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: readonly ErrorDetail[];
  /** Extra context for logs only. Never serialised into a response. */
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: readonly ErrorDetail[];
      context?: Readonly<Record<string, unknown>>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (options.details !== undefined) this.details = options.details;
    if (options.context !== undefined) this.context = options.context;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Constructors for the cases used most often. These exist so that call sites read
// as intent rather than as HTTP plumbing.

export const unauthenticated = (message = 'Authentication is required.'): AppError =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource.'): AppError =>
  new AppError('FORBIDDEN', message);

/**
 * Use this for a record the actor may not access, as well as one that does not
 * exist. A 403 would confirm the record exists — see docs/0004-authorization.md.
 */
export const notFound = (message = 'Not found.'): AppError => new AppError('NOT_FOUND', message);

export const conflict = (code: ErrorCode, message: string): AppError => new AppError(code, message);

export const validationFailed = (details: readonly ErrorDetail[]): AppError =>
  new AppError('VALIDATION_FAILED', 'The request contains invalid data.', { details });
