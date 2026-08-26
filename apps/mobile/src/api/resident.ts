import type {
  ComplaintCategoryName,
  ComplaintDetailView,
  ComplaintSummaryView,
  InvoiceDetailView,
  InvoiceSummaryView,
  MealTypeName,
  PaymentView,
  ReceiptView,
  ResidentHomeView,
} from '@heaven/contracts';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from '../lib/apiClient';

/**
 * The resident's own data.
 *
 * Every endpoint is scoped server-side to the authenticated user — no request
 * here carries a tenancy or resident id, so there is nothing for one resident to
 * tamper with in order to read another's rent or complaints.
 */

const ME = '/me';

export const residentKeys = {
  home: ['me', 'home'] as const,
  invoices: ['me', 'invoices'] as const,
  invoice: (id: string) => ['me', 'invoice', id] as const,
  payments: ['me', 'payments'] as const,
  paymentDetails: ['me', 'paymentDetails'] as const,
  electricity: ['me', 'electricity'] as const,
  complaints: ['me', 'complaints'] as const,
  complaint: (id: string) => ['me', 'complaint', id] as const,
  absences: (from: string, to: string) => ['me', 'absences', from, to] as const,
};

export interface PaymentDetails {
  readonly bankAccountName: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIfsc: string | null;
  readonly bankName: string | null;
  readonly upiId: string | null;
  readonly upiQrImageUrl: string | null;
}

export interface ElectricityEntry {
  readonly periodKey: string;
  readonly roomNumber: string;
  readonly previousReading: number;
  readonly currentReading: number;
  readonly units: number;
  readonly ratePaisePerUnit: number;
  readonly sharePaise: number;
  readonly occupiedDays: number;
}

export const useResidentHome = (): UseQueryResult<ResidentHomeView, Error> =>
  useQuery({
    queryKey: residentKeys.home,
    queryFn: ({ signal }) => apiRequest<ResidentHomeView>(`${ME}/home`, { signal }),
  });

export const useResidentInvoices = (): UseQueryResult<InvoiceSummaryView[], Error> =>
  useQuery({
    queryKey: residentKeys.invoices,
    queryFn: ({ signal }) => apiRequest<InvoiceSummaryView[]>(`${ME}/invoices`, { signal }),
  });

export const useResidentInvoice = (id: string): UseQueryResult<InvoiceDetailView, Error> =>
  useQuery({
    queryKey: residentKeys.invoice(id),
    queryFn: ({ signal }) => apiRequest<InvoiceDetailView>(`${ME}/invoices/${id}`, { signal }),
    enabled: id !== '',
  });

export const useResidentPayments = (): UseQueryResult<PaymentView[], Error> =>
  useQuery({
    queryKey: residentKeys.payments,
    queryFn: ({ signal }) => apiRequest<PaymentView[]>(`${ME}/payments`, { signal }),
  });

export const usePaymentDetails = (): UseQueryResult<PaymentDetails, Error> =>
  useQuery({
    queryKey: residentKeys.paymentDetails,
    queryFn: ({ signal }) => apiRequest<PaymentDetails>(`${ME}/payment-details`, { signal }),
  });

export const useResidentElectricity = (): UseQueryResult<ElectricityEntry[], Error> =>
  useQuery({
    queryKey: residentKeys.electricity,
    queryFn: ({ signal }) => apiRequest<ElectricityEntry[]>(`${ME}/electricity`, { signal }),
  });

export const useResidentComplaints = (): UseQueryResult<ComplaintSummaryView[], Error> =>
  useQuery({
    queryKey: residentKeys.complaints,
    queryFn: ({ signal }) => apiRequest<ComplaintSummaryView[]>(`${ME}/complaints`, { signal }),
  });

export const useResidentComplaint = (id: string): UseQueryResult<ComplaintDetailView, Error> =>
  useQuery({
    queryKey: residentKeys.complaint(id),
    queryFn: ({ signal }) => apiRequest<ComplaintDetailView>(`${ME}/complaints/${id}`, { signal }),
    enabled: id !== '',
  });

export const useAbsences = (
  from: string,
  to: string,
): UseQueryResult<Array<{ date: string; mealType: MealTypeName }>, Error> =>
  useQuery({
    queryKey: residentKeys.absences(from, to),
    queryFn: ({ signal }) =>
      apiRequest<Array<{ date: string; mealType: MealTypeName }>>(
        `${ME}/absences?from=${from}&to=${to}`,
        { signal },
      ),
  });

export async function fetchReceipt(id: string): Promise<ReceiptView> {
  return apiRequest<ReceiptView>(`${ME}/receipts/${id}`);
}

// --- Mutations --------------------------------------------------------------

function useResidentMutation<TInput, TResult>(
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

/**
 * Declares which meals the resident will miss on a date.
 *
 * The whole day is submitted at once, so resubmitting is naturally idempotent —
 * and the server refuses changes to today after the property's cutoff.
 */
export const useMarkAbsence = () =>
  useResidentMutation(
    (input: { date: string; absentMeals: MealTypeName[] }) =>
      apiRequest<{ date: string; absentMeals: MealTypeName[] }>(`${ME}/absences`, {
        method: 'POST',
        body: input,
      }),
    [residentKeys.home, ['me', 'absences']],
  );

export const useCreateComplaint = () =>
  useResidentMutation(
    (input: { title: string; description: string; category: ComplaintCategoryName }) =>
      apiRequest<ComplaintDetailView>(`${ME}/complaints`, { method: 'POST', body: input }),
    [residentKeys.complaints, residentKeys.home],
  );

export interface PaymentOrder {
  readonly orderId: string;
  readonly amountPaise: number;
  readonly token: string;
  readonly provider: string;
}

/**
 * Starts an online payment.
 *
 * The amount comes back from the SERVER, computed from the invoice — the app
 * never says what is owed. See docs/0007-payments.md.
 */
export async function startPayment(invoiceId: string): Promise<PaymentOrder> {
  return apiRequest<PaymentOrder>(`${ME}/payments/start`, {
    method: 'POST',
    body: { invoiceId },
  });
}

export const useConfirmPayment = () =>
  useResidentMutation(
    (input: { invoiceId: string; orderId: string; mockToken: string }) =>
      apiRequest<{ receiptNumber: string }>(`${ME}/payments/confirm`, {
        method: 'POST',
        body: input,
      }),
    [residentKeys.home, residentKeys.invoices, residentKeys.payments, ['me', 'invoice']],
  );
