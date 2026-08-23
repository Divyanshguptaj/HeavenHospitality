import type { PublicPropertyDetail } from '@heaven/contracts';
import type { ReactElement } from 'react';

import { usePublicProperty } from '../api/property';
import { ApiRequestError } from '../lib/apiClient';
import { ErrorState, LoadingState, Screen } from './ui';

/**
 * Every guest tab renders the same property snapshot, so they all share one
 * query, one loading state and one error state.
 *
 * Centralising this is what guarantees no screen ships without an error path —
 * the brief's "a feature is not complete because the screen exists" (§35).
 */
export function PropertyScreen({
  children,
}: {
  readonly children: (property: PublicPropertyDetail) => ReactElement;
}) {
  const { data, error, isPending, refetch, isRefetching } = usePublicProperty();

  if (isPending) {
    return (
      <Screen>
        <LoadingState label="Loading property details…" />
      </Screen>
    );
  }

  if (error) {
    const message =
      error instanceof ApiRequestError && error.code === 'NOT_FOUND'
        ? 'This property is not available right now.'
        : error instanceof ApiRequestError
          ? error.message
          : 'Please check your connection and try again.';

    return (
      <Screen>
        <ErrorState message={message} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      {children(data)}
    </Screen>
  );
}
