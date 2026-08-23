import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError, apiRequest, getAccessToken, setAccessToken } from './apiClient';

function jsonResponse(body: unknown, init: { status?: number; requestId?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.requestId === undefined ? {} : { 'x-request-id': init.requestId }),
    },
  });
}

const fetchMock = vi.fn();

/** Headers of the most recent fetch call, with the "was it called at all" check
 * done once rather than at every assertion. */
function lastRequestHeaders(): Record<string, string> {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) throw new Error('fetch was never called');
  return (call[1] as RequestInit).headers as Record<string, string>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('token handling', () => {
  it('keeps the access token in memory only', () => {
    setAccessToken('abc');
    expect(getAccessToken()).toBe('abc');
    // Nothing may reach web storage — an XSS-readable token is a 30-day
    // credential in the attacker's hands. See docs/0003-auth-and-sessions.md.
    expect(globalThis.localStorage?.getItem('accessToken') ?? null).toBeNull();
  });

  it('sends no Authorization header when signed out', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await apiRequest('/health');

    expect(lastRequestHeaders()['Authorization']).toBeUndefined();
  });

  it('attaches a bearer token when signed in', async () => {
    setAccessToken('token-123');
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await apiRequest('/tenancies');

    expect(lastRequestHeaders()['Authorization']).toBe('Bearer token-123');
  });

  it('forwards an idempotency key on retryable writes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await apiRequest('/payments', { method: 'POST', body: {}, idempotencyKey: 'key-1' });

    expect(lastRequestHeaders()['Idempotency-Key']).toBe('key-1');
  });
});

describe('envelope unwrapping', () => {
  it('returns the data payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { status: 'ok' } }));
    const result = await apiRequest<{ status: string }>('/health');
    expect(result.data).toEqual({ status: 'ok' });
  });

  it('returns pagination metadata when present', async () => {
    const meta = { page: 1, pageSize: 25, totalItems: 3, totalPages: 1 };
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: [], meta }));

    const result = await apiRequest('/invoices');
    expect(result.meta).toEqual(meta);
  });
});

describe('error handling', () => {
  it('preserves the server error code so the UI can branch on it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'BED_ALREADY_ALLOCATED',
            message: 'This bed is no longer available.',
            requestId: 'req-9',
          },
        },
        { status: 409 },
      ),
    );

    await expect(apiRequest('/beds/1/allocate', { method: 'POST' })).rejects.toMatchObject({
      code: 'BED_ALREADY_ALLOCATED',
      status: 409,
      requestId: 'req-9',
    });
  });

  it('surfaces field-level validation detail', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request contains invalid data.',
            requestId: 'req-10',
            details: [{ path: 'body.amountPaise', message: 'Must be a whole number of paise' }],
          },
        },
        { status: 400 },
      ),
    );

    await expect(apiRequest('/payments', { method: 'POST' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ path: 'body.amountPaise', message: 'Must be a whole number of paise' }],
    });
  });

  it('reports a network failure as a typed error, not a raw TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await apiRequest('/health').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('rejects an unreadable body rather than returning undefined', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>gateway error</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    await expect(apiRequest('/health')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('rejects a 200 that does not match the envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(apiRequest('/health')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
