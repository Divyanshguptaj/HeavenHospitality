import type {
  ComplaintDetailView,
  ComplaintSummaryView,
  DashboardView,
  FacilityView,
  FloorView,
  InvoiceSummaryView,
  MenuDayView,
  OccupancyView,
  PaymentView,
  PropertyPhotoView,
  ResidentDetailView,
  ResidentSummaryView,
  RoomView,
  RuleView,
  SettingsView,
} from '@heaven/contracts';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from '../lib/apiClient';

/**
 * The owner API, from the phone.
 *
 * Exactly the same endpoints the web console uses — the API has never cared
 * which client is calling it. Only the presentation differs.
 */

const OWNER = '/owner';

export const ownerKeys = {
  dashboard: ['owner', 'dashboard'] as const,
  occupancy: ['owner', 'occupancy'] as const,
  floors: ['owner', 'floors'] as const,
  room: (id: string) => ['owner', 'room', id] as const,
  residents: (search?: string) => ['owner', 'residents', search ?? null] as const,
  resident: (id: string) => ['owner', 'resident', id] as const,
  invoices: (status?: string) => ['owner', 'invoices', status ?? null] as const,
  payments: ['owner', 'payments'] as const,
  complaints: (status?: string) => ['owner', 'complaints', status ?? null] as const,
  complaint: (id: string) => ['owner', 'complaint', id] as const,
};

export const useOwnerDashboard = (): UseQueryResult<DashboardView, Error> =>
  useQuery({
    queryKey: ownerKeys.dashboard,
    queryFn: ({ signal }) => apiRequest<DashboardView>(`${OWNER}/dashboard`, { signal }),
  });

export const useOwnerOccupancy = (): UseQueryResult<OccupancyView, Error> =>
  useQuery({
    queryKey: ownerKeys.occupancy,
    queryFn: ({ signal }) => apiRequest<OccupancyView>(`${OWNER}/occupancy`, { signal }),
  });

export const useOwnerFloors = (): UseQueryResult<FloorView[], Error> =>
  useQuery({
    queryKey: ownerKeys.floors,
    queryFn: ({ signal }) => apiRequest<FloorView[]>(`${OWNER}/floors`, { signal }),
  });

export const useOwnerRoom = (id: string): UseQueryResult<RoomView, Error> =>
  useQuery({
    queryKey: ownerKeys.room(id),
    queryFn: ({ signal }) => apiRequest<RoomView>(`${OWNER}/rooms/${id}`, { signal }),
  });

export const useOwnerResidents = (search?: string): UseQueryResult<ResidentSummaryView[], Error> =>
  useQuery({
    queryKey: ownerKeys.residents(search),
    queryFn: ({ signal }) =>
      apiRequest<ResidentSummaryView[]>(
        `${OWNER}/residents${search === undefined || search === '' ? '' : `?search=${encodeURIComponent(search)}`}`,
        { signal },
      ),
  });

export const useOwnerResident = (id: string): UseQueryResult<ResidentDetailView, Error> =>
  useQuery({
    queryKey: ownerKeys.resident(id),
    queryFn: ({ signal }) => apiRequest<ResidentDetailView>(`${OWNER}/residents/${id}`, { signal }),
    enabled: id !== '',
  });

export const useOwnerInvoices = (status?: string): UseQueryResult<InvoiceSummaryView[], Error> =>
  useQuery({
    queryKey: ownerKeys.invoices(status),
    queryFn: ({ signal }) =>
      apiRequest<InvoiceSummaryView[]>(
        `${OWNER}/invoices${status === undefined ? '' : `?status=${status}`}`,
        { signal },
      ),
  });

export const useOwnerPayments = (): UseQueryResult<PaymentView[], Error> =>
  useQuery({
    queryKey: ownerKeys.payments,
    queryFn: ({ signal }) => apiRequest<PaymentView[]>(`${OWNER}/payments`, { signal }),
  });

export const useOwnerComplaints = (
  status?: string,
): UseQueryResult<ComplaintSummaryView[], Error> =>
  useQuery({
    queryKey: ownerKeys.complaints(status),
    queryFn: ({ signal }) =>
      apiRequest<ComplaintSummaryView[]>(
        `${OWNER}/complaints${status === undefined || status === 'ALL' ? '' : `?status=${status}`}`,
        { signal },
      ),
  });

function useOwnerMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  invalidates: ReadonlyArray<readonly unknown[]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    // Refetch whether the mutation reports success or failure, not just on
    // success: a client-side timeout or dropped response can report failure
    // for a write the server already completed, and only a fresh read of the
    // server's actual state — not the failed response — can tell the screen
    // what really happened.
    onSettled: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

/**
 * Records a cash/UPI/bank payment — the dominant real-world case in a PG.
 *
 * Takes an `idempotencyKey` the caller keeps stable across retries of the
 * SAME attempt (a slow request that times out and gets retried, or a
 * double-tap): the server recognises a repeated key and returns the original
 * payment instead of recording a second one.
 */
export const useRecordPayment = () =>
  useOwnerMutation(
    (input: {
      tenancyId: string;
      invoiceId?: string;
      amountPaise: number;
      method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
      paidAt: string;
      reference?: string;
      idempotencyKey: string;
    }) => {
      const { idempotencyKey, ...body } = input;
      return apiRequest<PaymentView>(`${OWNER}/payments`, { method: 'POST', body, idempotencyKey });
    },
    [ownerKeys.dashboard, ownerKeys.payments, ['owner', 'invoices'], ['owner', 'residents']],
  );

export const useUpdateComplaintStatus = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; status?: string; note?: string }) =>
      apiRequest<ComplaintDetailView>(`${OWNER}/complaints/${id}`, { method: 'PATCH', body }),
    [['owner', 'complaints'], ['owner', 'complaint'], ownerKeys.dashboard],
  );

export const useGenerateInvoices = () =>
  useOwnerMutation(
    (periodKey: string) =>
      apiRequest<{ created: number; skipped: number }>(`${OWNER}/invoices/generate`, {
        method: 'POST',
        body: { periodKey },
      }),
    [['owner', 'invoices'], ownerKeys.dashboard, ['owner', 'residents']],
  );

export const useRecordReading = () =>
  useOwnerMutation(
    (input: {
      roomId: string;
      periodKey: string;
      previousReading: number;
      currentReading: number;
      readingDate: string;
    }) => apiRequest<unknown>(`${OWNER}/electricity`, { method: 'POST', body: input }),
    [
      ['owner', 'invoices'],
      ownerKeys.dashboard,
      ['owner', 'room'],
      ['owner', 'residents'],
      ['owner', 'resident'],
    ],
  );

/** The room's last reading, to prefill "previous reading" without retyping it. */
export const useLastReading = (
  roomId: string,
): UseQueryResult<{ currentReading: number; periodKey: string; readingDate: string } | null, Error> =>
  useQuery({
    queryKey: ['owner', 'electricity', 'last', roomId],
    queryFn: ({ signal }) =>
      apiRequest<{ currentReading: number; periodKey: string; readingDate: string } | null>(
        `${OWNER}/electricity/last/${roomId}`,
        { signal },
      ),
    enabled: roomId !== '',
  });

/** A manual correction to one resident's share of a room's electricity bill. */
export const useUpdateElectricityShare = () =>
  useOwnerMutation(
    ({ id, sharePaise }: { id: string; sharePaise: number }) =>
      apiRequest<{ updated: boolean }>(`${OWNER}/electricity/shares/${id}`, {
        method: 'PATCH',
        body: { sharePaise },
      }),
    [['owner', 'invoices'], ownerKeys.dashboard, ['owner', 'residents'], ['owner', 'resident']],
  );

// --- Floors, rooms, beds and residents ---------------------------------------
//
// Everything an owner does to the building — floors, rooms, beds and who is
// assigned where — happens from the phone. There is no separate console.

// ['owner', 'room'] with no id invalidates every single-room query by prefix,
// the same partial-match trick used for ['owner', 'residents'] elsewhere here.
const OCCUPANCY_KEYS = [
  ownerKeys.dashboard,
  ownerKeys.occupancy,
  ownerKeys.floors,
  ['owner', 'room'],
];

export const useCreateFloor = () =>
  useOwnerMutation(
    (input: { name: string; level: number }) =>
      apiRequest<FloorView>(`${OWNER}/floors`, { method: 'POST', body: input }),
    OCCUPANCY_KEYS,
  );

export const useDeleteFloor = () =>
  useOwnerMutation(
    (id: string) => apiRequest<unknown>(`${OWNER}/floors/${id}`, { method: 'DELETE' }),
    OCCUPANCY_KEYS,
  );

export const useCreateRoom = () =>
  useOwnerMutation(
    (input: {
      floorId: string;
      number: string;
      roomType: string;
      capacity: number;
      monthlyRentPaise: number;
      isAirConditioned: boolean;
    }) => apiRequest<RoomView>(`${OWNER}/rooms`, { method: 'POST', body: input }),
    OCCUPANCY_KEYS,
  );

export const useUpdateRoom = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest<RoomView>(`${OWNER}/rooms/${id}`, { method: 'PATCH', body }),
    OCCUPANCY_KEYS,
  );

export const useDeleteRoom = () =>
  useOwnerMutation(
    (id: string) => apiRequest<unknown>(`${OWNER}/rooms/${id}`, { method: 'DELETE' }),
    OCCUPANCY_KEYS,
  );

export const useUpdateBedStatus = () =>
  useOwnerMutation(
    ({ id, status }: { id: string; status: string }) =>
      apiRequest<RoomView>(`${OWNER}/beds/${id}/status`, { method: 'PATCH', body: { status } }),
    OCCUPANCY_KEYS,
  );

/** Fills an empty bed — reuses an existing account when one is found. */
export const useCreateResident = () =>
  useOwnerMutation(
    (body: unknown) => apiRequest<ResidentSummaryView>(`${OWNER}/residents`, { method: 'POST', body }),
    [...OCCUPANCY_KEYS, ['owner', 'residents']],
  );

/** Edits a resident's own details — contact, rent override, deposit, emergency contact. */
export const useUpdateResident = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest<ResidentSummaryView>(`${OWNER}/residents/${id}`, { method: 'PATCH', body }),
    [...OCCUPANCY_KEYS, ['owner', 'residents'], ['owner', 'resident']],
  );

/**
 * Takes a resident off a bed. The server refuses this while rent is
 * outstanding and, once it succeeds, reverts the account to non-resident.
 */
export const useExitResident = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; actualExitDate: string; reason?: string }) =>
      apiRequest<ResidentSummaryView>(`${OWNER}/residents/${id}/exit`, { method: 'POST', body }),
    [...OCCUPANCY_KEYS, ['owner', 'residents']],
  );

/**
 * Looks a person up by phone — the identity a resident actually signs up
 * with — so filling a bed reuses their account instead of inventing one.
 */
export async function lookupUserByPhone(phone: string): Promise<{
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hasActiveTenancy: boolean;
} | null> {
  return apiRequest(`${OWNER}/residents/lookup-by-phone?phone=${encodeURIComponent(phone)}`);
}

// --- Public content: mess menu, property profile, facilities, rules, gallery -
//
// Everything a guest reads on the public pages, edited from the phone.

export const useOwnerMenu = (): UseQueryResult<MenuDayView[], Error> =>
  useQuery({
    queryKey: ['owner', 'mess', 'menu'],
    queryFn: ({ signal }) => apiRequest<MenuDayView[]>(`${OWNER}/mess/menu`, { signal }),
  });

/** Sets (or, given an empty list, clears) one day's one meal. */
export const useUpdateMenuDay = () =>
  useOwnerMutation(
    (input: { dayOfWeek: number; mealType: string; items: string[] }) =>
      apiRequest<MenuDayView[]>(`${OWNER}/mess/menu`, { method: 'PUT', body: input }),
    [['owner', 'mess', 'menu']],
  );

export const useUpdateMealTiming = () =>
  useOwnerMutation(
    (input: { mealType: string; startsAt: string; endsAt: string }) =>
      apiRequest<{ updated: boolean }>(`${OWNER}/mess/timings`, { method: 'PUT', body: input }),
    [['owner', 'settings']],
  );

/** The property profile (about/contact/location), plus financial, payment and mess settings. */
export const useOwnerSettings = (): UseQueryResult<SettingsView, Error> =>
  useQuery({
    queryKey: ['owner', 'settings'],
    queryFn: ({ signal }) => apiRequest<SettingsView>(`${OWNER}/settings`, { signal }),
  });

/** About, contact and location — the fields a guest reads on the public pages. */
export const useUpdatePropertyProfile = () =>
  useOwnerMutation(
    (body: Record<string, unknown>) =>
      apiRequest<SettingsView>(`${OWNER}/property`, { method: 'PATCH', body }),
    [['owner', 'settings']],
  );

export const useOwnerFacilities = (): UseQueryResult<FacilityView[], Error> =>
  useQuery({
    queryKey: ['owner', 'facilities'],
    queryFn: ({ signal }) => apiRequest<FacilityView[]>(`${OWNER}/facilities`, { signal }),
  });

export const useCreateFacility = () =>
  useOwnerMutation(
    (body: Record<string, unknown>) =>
      apiRequest<FacilityView>(`${OWNER}/facilities`, { method: 'POST', body }),
    [['owner', 'facilities']],
  );

export const useUpdateFacility = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest<FacilityView>(`${OWNER}/facilities/${id}`, { method: 'PATCH', body }),
    [['owner', 'facilities']],
  );

export const useDeleteFacility = () =>
  useOwnerMutation(
    (id: string) => apiRequest<unknown>(`${OWNER}/facilities/${id}`, { method: 'DELETE' }),
    [['owner', 'facilities']],
  );

export const useOwnerRules = (): UseQueryResult<RuleView[], Error> =>
  useQuery({
    queryKey: ['owner', 'rules'],
    queryFn: ({ signal }) => apiRequest<RuleView[]>(`${OWNER}/rules`, { signal }),
  });

export const useCreateRule = () =>
  useOwnerMutation(
    (body: Record<string, unknown>) => apiRequest<RuleView>(`${OWNER}/rules`, { method: 'POST', body }),
    [['owner', 'rules']],
  );

export const useUpdateRule = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest<RuleView>(`${OWNER}/rules/${id}`, { method: 'PATCH', body }),
    [['owner', 'rules']],
  );

export const useDeleteRule = () =>
  useOwnerMutation(
    (id: string) => apiRequest<unknown>(`${OWNER}/rules/${id}`, { method: 'DELETE' }),
    [['owner', 'rules']],
  );

export const useOwnerGallery = (): UseQueryResult<PropertyPhotoView[], Error> =>
  useQuery({
    queryKey: ['owner', 'gallery'],
    queryFn: ({ signal }) => apiRequest<PropertyPhotoView[]>(`${OWNER}/gallery`, { signal }),
  });

export const useCreatePhoto = () =>
  useOwnerMutation(
    (body: Record<string, unknown>) =>
      apiRequest<PropertyPhotoView>(`${OWNER}/gallery`, { method: 'POST', body }),
    [['owner', 'gallery']],
  );

export const useUpdatePhoto = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest<PropertyPhotoView>(`${OWNER}/gallery/${id}`, { method: 'PATCH', body }),
    [['owner', 'gallery']],
  );

export const useDeletePhoto = () =>
  useOwnerMutation(
    (id: string) => apiRequest<unknown>(`${OWNER}/gallery/${id}`, { method: 'DELETE' }),
    [['owner', 'gallery']],
  );
