import type {
  PublicContactView,
  PublicFacilityView,
  PublicGalleryView,
  PublicHomeView,
  PublicLocationView,
  PublicPropertyView,
  PublicRoomsView,
  PublicRuleView,
  PublicWeekMenuView,
} from '@heaven/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from '../lib/apiClient';

/**
 * The public experience's data layer.
 *
 * Everything here is unauthenticated, so these hooks work identically for a
 * guest, a signed-in NON_RESIDENT and a RESIDENT. No screen in the public
 * section may reach for an authenticated endpoint — that is what lets the same
 * screens serve all three without being forked by role.
 *
 * Stale times are chosen per resource, not globally. This information changes
 * when the owner edits it — occasionally — so the right default is minutes, not
 * seconds, and certainly not a socket. The one exception is availability, which
 * is the number someone is deciding on and the one that actually moves.
 */

/**
 * Query keys are namespaced under 'public' so signing out can drop every
 * authenticated query without touching these — a guest's cached property
 * information is not private and should survive.
 */
export const publicKeys = {
  all: ['public'] as const,
  home: () => [...publicKeys.all, 'home'] as const,
  property: () => [...publicKeys.all, 'property'] as const,
  rooms: () => [...publicKeys.all, 'rooms'] as const,
  availability: () => [...publicKeys.all, 'availability'] as const,
  menuWeek: () => [...publicKeys.all, 'menu', 'week'] as const,
  facilities: () => [...publicKeys.all, 'facilities'] as const,
  gallery: (page: number) => [...publicKeys.all, 'gallery', page] as const,
  rules: () => [...publicKeys.all, 'rules'] as const,
  contact: () => [...publicKeys.all, 'contact'] as const,
  location: () => [...publicKeys.all, 'location'] as const,
};

const MINUTE = 60_000;

/**
 * Availability moves as people move in and out, and it is the number a
 * prospective resident is acting on — so it is the one thing worth refetching
 * often. Everything else is edited by hand and can be minutes stale.
 */
const STALE_AVAILABILITY = 60_000;
const STALE_CONTENT = 5 * MINUTE;
/** Rules and facilities change a few times a year. */
const STALE_RARE = 30 * MINUTE;

function publicQuery<T>(key: readonly unknown[], path: string, staleTime: number) {
  return {
    queryKey: key,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiRequest<T>(`/public${path}`, { signal }),
    staleTime,
  };
}

/** The landing screen: one request, because it is the one everybody loads. */
export function usePublicHome(): UseQueryResult<PublicHomeView, Error> {
  return useQuery(
    publicQuery<PublicHomeView>(publicKeys.home(), '/home', STALE_AVAILABILITY),
  );
}

export function usePublicProperty(): UseQueryResult<PublicPropertyView, Error> {
  return useQuery(
    publicQuery<PublicPropertyView>(publicKeys.property(), '/property', STALE_CONTENT),
  );
}

export function usePublicRooms(): UseQueryResult<PublicRoomsView, Error> {
  return useQuery(publicQuery<PublicRoomsView>(publicKeys.rooms(), '/rooms', STALE_AVAILABILITY));
}

export function usePublicMenu(): UseQueryResult<PublicWeekMenuView, Error> {
  return useQuery(
    publicQuery<PublicWeekMenuView>(publicKeys.menuWeek(), '/menu/week', STALE_CONTENT),
  );
}

export function usePublicFacilities(): UseQueryResult<PublicFacilityView[], Error> {
  return useQuery(
    publicQuery<PublicFacilityView[]>(publicKeys.facilities(), '/facilities', STALE_RARE),
  );
}

export function usePublicGallery(page = 1): UseQueryResult<PublicGalleryView, Error> {
  return useQuery(
    publicQuery<PublicGalleryView>(
      publicKeys.gallery(page),
      `/gallery?page=${String(page)}`,
      STALE_RARE,
    ),
  );
}

export function usePublicRules(): UseQueryResult<PublicRuleView[], Error> {
  return useQuery(publicQuery<PublicRuleView[]>(publicKeys.rules(), '/rules', STALE_RARE));
}

export function usePublicContact(): UseQueryResult<PublicContactView, Error> {
  return useQuery(publicQuery<PublicContactView>(publicKeys.contact(), '/contact', STALE_CONTENT));
}

export function usePublicLocation(): UseQueryResult<PublicLocationView, Error> {
  return useQuery(
    publicQuery<PublicLocationView>(publicKeys.location(), '/location', STALE_CONTENT),
  );
}
