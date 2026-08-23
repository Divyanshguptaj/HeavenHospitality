import { QueryClient } from '@tanstack/react-query';

import { ApiRequestError } from './apiClient';

/**
 * TanStack Query owns all server state. Nothing fetched from the API belongs in
 * Zustand — duplicating it there is how two components end up disagreeing about
 * what a tenant owes.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying an authorization or validation failure cannot succeed and only
        // multiplies the load and the audit noise.
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      // Writes are never retried automatically. A retried payment or allocation
      // is a duplicate; retries are an explicit user action with an idempotency
      // key. See docs/0006-idempotency-and-jobs.md.
      retry: false,
    },
  },
});
