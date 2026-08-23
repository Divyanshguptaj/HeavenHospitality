import {
  apiErrorSchema,
  type ApiError,
  type ErrorCode,
  type PaginationMeta,
} from '@heaven/contracts';

import { env } from '../config/env';

/**
 * The access token lives in a module variable — never `localStorage` or
 * `sessionStorage`.
 *
 * Anything in web storage is readable by any injected script, and an exfiltrated
 * token is usable from the attacker's own machine. In memory it dies with the tab.
 * The refresh token is never visible to JavaScript at all; it travels in an
 * httpOnly cookie scoped to the two auth endpoints.
 *
 * See docs/0003-auth-and-sessions.md.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** A failed API call, carrying the server's error code for the UI to branch on. */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: ApiError['error']['details'];

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    requestId?: string,
    details?: ApiError['error']['details'],
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

/**
 * Detects a cancelled fetch across runtimes: browsers throw a `DOMException`
 * named `AbortError`, but checking the signal directly is the reliable test.
 */
function isAbortError(cause: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted === true) return true;
  return cause instanceof Error && cause.name === 'AbortError';
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /** Set on retryable writes so a double-submit cannot create two records. */
  readonly idempotencyKey?: string;
}

export interface ApiResult<T> {
  readonly data: T;
  readonly meta: PaginationMeta | undefined;
}

/**
 * Performs a request and unwraps the API envelope.
 *
 * Every failure — HTTP error, malformed body, network outage — arrives as an
 * `ApiRequestError` with a code, so no caller has to inspect `response.ok` or
 * guess at a shape.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', body, signal, idempotencyKey } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
      method,
      headers,
      // Sends the refresh cookie on the auth endpoints; harmless elsewhere.
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    // A cancelled request is not a failure. TanStack Query aborts superseded
    // fetches routinely; remapping that to a network error makes every
    // fast-typing search look like an outage and triggers pointless retries.
    if (isAbortError(cause, signal)) {
      throw new ApiRequestError('REQUEST_ABORTED', 'The request was cancelled.', 0);
    }
    throw new ApiRequestError(
      'PROVIDER_UNAVAILABLE',
      'Could not reach the server. Check your connection and try again.',
      0,
    );
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'The server returned an unreadable response.',
      response.status,
      requestId,
    );
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiRequestError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.requestId,
        parsed.data.error.details,
      );
    }
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'The server returned an unexpected error.',
      response.status,
      requestId,
    );
  }

  const envelope = payload as { success?: boolean; data?: T; meta?: PaginationMeta };
  if (envelope.success !== true || envelope.data === undefined) {
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'The server returned an unexpected response shape.',
      response.status,
      requestId,
    );
  }

  return { data: envelope.data, meta: envelope.meta };
}

/** Convenience wrapper for the common case where pagination is not needed. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const result = await apiRequest<T>(path, signal === undefined ? {} : { signal });
  return result.data;
}
