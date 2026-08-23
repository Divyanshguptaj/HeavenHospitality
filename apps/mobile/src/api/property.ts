import type { PublicPropertyDetail } from '@heaven/contracts';
import Constants from 'expo-constants';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from '../lib/apiClient';

/**
 * The property this build represents.
 *
 * A single-property app for now. When the guest experience covers several
 * properties this becomes a route parameter rather than configuration — the API
 * already supports it.
 */
export const PROPERTY_SLUG =
  (Constants.expoConfig?.extra?.['propertySlug'] as string | undefined) ??
  'heaven-hospitality-kothrud';

/**
 * The whole guest experience reads from one endpoint under one query key, so
 * every tab renders the same snapshot and switching tabs never refetches.
 */
export function usePublicProperty(): UseQueryResult<PublicPropertyDetail, Error> {
  return useQuery({
    queryKey: ['public', 'property', PROPERTY_SLUG],
    queryFn: ({ signal }) =>
      apiRequest<PublicPropertyDetail>(`/public/properties/${PROPERTY_SLUG}`, { signal }),
    staleTime: 5 * 60_000,
  });
}
