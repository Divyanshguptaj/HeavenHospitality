import { apiErrorSchema, type ErrorCode } from '@heaven/contracts';
import Constants from 'expo-constants';

import { clearRefreshToken, readRefreshToken, saveRefreshToken } from './secureTokenStore';

/**
 * The mobile API client.
 *
 * Mirrors the admin client's contract deliberately: same envelope, same typed
 * error, same Bearer transport. One API, two clients — no mobile-only endpoints.
 */
/**
 * Resolves the API base URLs to try, in order.
 *
 * On a physical device `localhost` is the *phone*, not the development machine,
 * so a configured localhost URL can never reach the API on its own. In
 * development we take the LAN address Expo is already serving the bundle from
 * (`hostUri`, e.g. `192.168.0.106:8081`) and reuse its host with the API port.
 *
 * This keeps the laptop's IP out of source control and means it keeps working
 * when the router hands out a different address tomorrow.
 */
function resolveApiBaseUrls(): readonly string[] {
  const configured =
    (Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined) ??
    'http://localhost:4000/api/v1';

  if (!__DEV__ || !configured.includes('localhost')) return [configured];

  const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devServerHost === undefined || devServerHost === '') return [configured];

  // The LAN address usually works, but on a hotspot with client isolation (or
  // any network that blocks phone-to-laptop LAN traffic) it never will — only
  // `adb reverse`, which tunnels the phone's own `localhost`, gets through. Try
  // the LAN address first since it needs no cable, then fall back to localhost.
  return [configured.replace('localhost', devServerHost), configured];
}

const apiBaseUrls = resolveApiBaseUrls();
/** Index into `apiBaseUrls` of the candidate that last worked, tried first from now on. */
let workingBaseUrlIndex = 0;

/** In memory only — never SecureStore, never AsyncStorage. */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Called once, from the auth store, the moment a session turns out to be
 * genuinely dead (the refresh token itself was rejected) — never for a routine
 * access-token expiry, which `apiRequest` recovers from on its own below.
 * The auth store flips to `signedOut`; the root layout's existing redirect then
 * sends the app back to the public screen, same as any other sign-out.
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Exchanges the stored refresh token for a new access token, without going
 * through `apiRequest` — that would recurse into this same 401 handling.
 * Deduplicated across concurrent requests: several screens hitting a stale
 * access token at once must trigger exactly one `/auth/refresh` call, not one
 * per request.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = await readRefreshToken().catch(() => null);
  if (refreshToken === null) return false;

  try {
    const response = await fetch(`${apiBaseUrls[workingBaseUrlIndex]}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken, client: 'mobile' }),
    });
    if (!response.ok) return false;

    const payload = (await response.json()) as {
      data?: { accessToken?: string; refreshToken?: string };
    };
    const newAccessToken = payload.data?.accessToken;
    if (newAccessToken === undefined) return false;

    setAccessToken(newAccessToken);
    if (payload.data?.refreshToken !== undefined) {
      await saveRefreshToken(payload.data.refreshToken);
    }
    return true;
  } catch {
    return false;
  }
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

/**
 * Aborts a request that gets no response within this long.
 *
 * Generous on purpose: a write that touches several tables can take a real
 * while against a database waking up from idle, and a client-side timeout
 * that fires before the server has actually finished is worse than a slow
 * spinner — the write still lands, but the screen reports it as failed.
 *
 * TEMPORARILY raised from 30s while the dev database's per-query latency is
 * high enough for some writes to genuinely take longer than that — see the
 * electricity-invoice round-trip fix. Once that class of slow endpoint is
 * gone this should come back down; a request that is still running after two
 * minutes is not "slow", it is stuck.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly timeoutMs?: number;
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return performRequest<T>(path, options, false);
}

async function performRequest<T>(
  path: string,
  options: RequestOptions,
  isRetryAfterRefresh: boolean,
): Promise<T> {
  const { method = 'GET', body, signal, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken !== null) headers['Authorization'] = `Bearer ${accessToken}`;
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;

  const requestController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMs);
  const onCallerAbort = (): void => requestController.abort();
  signal?.addEventListener('abort', onCallerAbort);

  let response: Response | undefined;
  let lastFailure: unknown;
  try {
    // Try the candidate that worked last time first, then the others — a dev
    // box with `adb reverse` set up but no plain LAN route (or vice versa)
    // should only ever pay the cost of the failing candidate once.
    for (let attempt = 0; attempt < apiBaseUrls.length; attempt++) {
      const index = (workingBaseUrlIndex + attempt) % apiBaseUrls.length;
      try {
        response = await fetch(`${apiBaseUrls[index]}${path}`, {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: requestController.signal,
        });
        workingBaseUrlIndex = index;
        break;
      } catch (cause) {
        lastFailure = cause;
        const cancelled =
          timedOut || signal?.aborted === true || (cause instanceof Error && cause.name === 'AbortError');
        if (cancelled) break;
      }
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (response === undefined) {
    if (timedOut) {
      console.error(`[api] ${method} ${path} timed out after ${String(timeoutMs)}ms`);
      throw new ApiRequestError(
        'REQUEST_ABORTED',
        'The server is taking too long to respond. It may still complete — check back before trying again.',
        0,
      );
    }
    if (signal?.aborted === true || (lastFailure instanceof Error && lastFailure.name === 'AbortError')) {
      throw new ApiRequestError('REQUEST_ABORTED', 'The request was cancelled.', 0);
    }
    console.error(`[api] ${method} ${path} failed`, lastFailure);
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
  } catch (cause) {
    console.error(`[api] ${method} ${path} returned unreadable JSON`, cause);
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'The server returned an unreadable response.',
      response.status,
      requestId,
    );
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const code = parsed.success ? parsed.data.error.code : 'INTERNAL_ERROR';

    // An expired (not revoked) access token is routine — the token's own TTL is
    // much shorter than a session — so it is recovered from silently: refresh
    // once, retry the ONE request that hit it, and the caller never sees a
    // failure. Only a second 401, right after a fresh token, or a refresh that
    // itself fails, means the session is actually dead.
    if (code === 'UNAUTHENTICATED' && !isRetryAfterRefresh && path !== '/auth/refresh') {
      refreshInFlight ??= refreshSession().finally(() => {
        refreshInFlight = null;
      });
      if (await refreshInFlight) {
        return performRequest<T>(path, options, true);
      }
    }

    if (code === 'UNAUTHENTICATED' || code === 'SESSION_REVOKED') {
      await clearRefreshToken().catch(() => undefined);
      setAccessToken(null);
      onSessionExpired?.();
    }

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
    console.error(`[api] ${method} ${path} returned an unexpected response shape`, payload);
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'The server returned an unexpected response shape.',
      response.status,
      requestId,
    );
  }

  return envelope.data;
}
