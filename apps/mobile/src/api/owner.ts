import type {
  ComplaintDetailView,
  ComplaintSummaryView,
  DashboardView,
  InvoiceSummaryView,
  MealCountView,
  OccupancyView,
  PaymentView,
  ResidentSummaryView,
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
