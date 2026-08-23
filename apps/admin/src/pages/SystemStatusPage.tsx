import { useQuery } from '@tanstack/react-query';

import { ApiRequestError, apiGet } from '../lib/apiClient';

interface Readiness {
  readonly status: 'ready' | 'degraded';
  readonly database: 'up' | 'down';
}

/**
 * The first real screen, and the reference for every screen after it: each of
 * loading, error and success is handled explicitly. A screen with no error state
 * is not finished.
 */
export function SystemStatusPage() {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: ({ signal }) => apiGet<Readiness>('/health/ready', signal),
    refetchInterval: 30_000,
  });

  return (
    <section aria-labelledby="system-heading" className="max-w-2xl">
      <header className="mb-5">
        <h1 id="system-heading" className="text-xl font-semibold text-[var(--color-text-primary)]">
          System status
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Live health of the API and its database connection.
        </p>
      </header>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {isPending ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            <span className="sr-only">Checking system status</span>
            <div className="h-4 w-40 animate-pulse rounded bg-[var(--color-surface-subtle)]" />
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--color-surface-subtle)]" />
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-danger)]">
                Could not reach the API
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {error instanceof ApiRequestError ? error.message : 'An unexpected error occurred.'}
              </p>
              {error instanceof ApiRequestError && error.requestId !== undefined && (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Reference: <span className="tabular">{error.requestId}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)]"
            >
              Try again
            </button>
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--color-text-secondary)]">API</dt>
            <dd>
              <StatusBadge
                tone={data.status === 'ready' ? 'success' : 'warning'}
                label={data.status === 'ready' ? 'Ready' : 'Degraded'}
              />
            </dd>

            <dt className="text-[var(--color-text-secondary)]">Database</dt>
            <dd>
              <StatusBadge
                tone={data.database === 'up' ? 'success' : 'danger'}
                label={data.database === 'up' ? 'Connected' : 'Unreachable'}
              />
            </dd>
          </dl>
        )}
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-muted)]" aria-live="polite">
        {isFetching ? 'Refreshing…' : 'Refreshes every 30 seconds.'}
      </p>
    </section>
  );
}

/**
 * Status is never communicated by colour alone — each badge carries a text label,
 * which is what makes it readable to a screen reader and to a colour-blind user.
 */
function StatusBadge({
  tone,
  label,
}: {
  readonly tone: 'success' | 'warning' | 'danger';
  readonly label: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    success: 'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
