import { apiErrorSchema, type ErrorCode } from '@heaven/contracts';
import Constants from 'expo-constants';

/**
 * The mobile API client.
 *
 * Mirrors the admin client's contract deliberately: same envelope, same typed
 * error, same Bearer transport. One API, two clients — no mobile-only endpoints.
 */
const apiBaseUrl =
  (Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined) ??
  'http://localhost:4000/api/v1';

/** In memory only — never SecureStore, never AsyncStorage. */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(code: ErrorCode, message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, idempotencyKey } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    // A cancelled request is not a failure — see the admin client for why.
    if (signal?.aborted === true || (cause instanceof Error && cause.name === 'AbortError')) {
      throw new ApiRequestError('REQUEST_ABORTED', 'The request was cancelled.', 0);
    }
    throw new ApiRequestError(
      'PROVIDER_UNAVAILABLE',
      'No connection to the server. Check your network and try again.',
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
    throw parsed.success
      ? new ApiRequestError(
          parsed.data.error.code,
          parsed.data.error.message,
          response.status,
          parsed.data.error.requestId,
        )
      : new ApiRequestError(
          'INTERNAL_ERROR',
          'The server returned an unexpected error.',
          response.status,
          requestId,
        );
  }

  const envelope = payload as { success?: boolean; data?: T };
  if (envelope.success !== true || envelope.data === undefined) {
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'The server returned an unexpected response shape.',
      response.status,
      requestId,
    );
  }

  return envelope.data;
}
