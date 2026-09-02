import type {
  ComplaintDetailView,
  ComplaintSummaryView,
  DashboardView,
  FloorView,
  InvoiceSummaryView,
  MealCountView,
  OccupancyView,
  PaymentView,
  ResidentSummaryView,
  RoomView,
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
  invoices: (status?: string) => ['owner', 'invoices', status ?? null] as const,
  payments: ['owner', 'payments'] as const,
  complaints: (status?: string) => ['owner', 'complaints', status ?? null] as const,
  complaint: (id: string) => ['owner', 'complaint', id] as const,
  mealCounts: ['owner', 'mealCounts'] as const,
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

export const useOwnerMealCounts = (): UseQueryResult<MealCountView, Error> =>
  useQuery({
    queryKey: ownerKeys.mealCounts,
    queryFn: ({ signal }) => apiRequest<MealCountView>(`${OWNER}/mess/counts`, { signal }),
  });

function useOwnerMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  invalidates: ReadonlyArray<readonly unknown[]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

/** Records a cash/UPI/bank payment — the dominant real-world case in a PG. */
export const useRecordPayment = () =>
  useOwnerMutation(
    (input: {
      tenancyId: string;
      invoiceId?: string;
      amountPaise: number;
      method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
      paidAt: string;
      reference?: string;
    }) => apiRequest<PaymentView>(`${OWNER}/payments`, { method: 'POST', body: input }),
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
    [['owner', 'invoices'], ownerKeys.dashboard],
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
