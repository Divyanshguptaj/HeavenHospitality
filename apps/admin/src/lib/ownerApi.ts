import type {
  ComplaintDetailView,
  ComplaintSummaryView,
  DashboardView,
  ExpenseView,
  FloorView,
  InventoryItemView,
  InvoiceDetailView,
  InvoiceSummaryView,
  MealCountView,
  MenuDayView,
  MeterReadingView,
  NoticeView,
  OccupancyView,
  PaymentView,
  ReminderEventView,
  ResidentDetailView,
  ResidentSummaryView,
  RoomView,
  SettingsView,
  StaffView,
} from '@heaven/contracts';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from './apiClient';

/**
 * Typed access to the owner API.
 *
 * One place that knows every endpoint and its response type, so a screen never
 * hand-rolls a URL or re-declares a shape. Mutations invalidate the query keys
 * they affect, which is what keeps the dashboard honest after an edit.
 */

const OWNER = '/owner';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const result = await apiRequest<T>(`${OWNER}${path}`, signal === undefined ? {} : { signal });
  return result.data;
}

async function send<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const result = await apiRequest<T>(`${OWNER}${path}`, {
    method,
    ...(body === undefined ? {} : { body }),
  });
  return result.data;
}

/** Query keys, centralised so invalidation cannot drift from the fetch. */
export const keys = {
  dashboard: ['owner', 'dashboard'] as const,
  occupancy: ['owner', 'occupancy'] as const,
  settings: ['owner', 'settings'] as const,
  floors: ['owner', 'floors'] as const,
  rooms: ['owner', 'rooms'] as const,
  residents: (filters?: unknown) => ['owner', 'residents', filters ?? null] as const,
  resident: (id: string) => ['owner', 'resident', id] as const,
  invoices: (filters?: unknown) => ['owner', 'invoices', filters ?? null] as const,
  invoice: (id: string) => ['owner', 'invoice', id] as const,
  payments: (search?: string) => ['owner', 'payments', search ?? null] as const,
  electricity: (filters?: unknown) => ['owner', 'electricity', filters ?? null] as const,
  menu: ['owner', 'menu'] as const,
  mealCounts: (date?: string) => ['owner', 'mealCounts', date ?? null] as const,
  complaints: (filters?: unknown) => ['owner', 'complaints', filters ?? null] as const,
  complaint: (id: string) => ['owner', 'complaint', id] as const,
  notices: ['owner', 'notices'] as const,
  staff: ['owner', 'staff'] as const,
  inventory: ['owner', 'inventory'] as const,
  expenses: (periodKey?: string) => ['owner', 'expenses', periodKey ?? null] as const,
  reminders: ['owner', 'reminders'] as const,
};

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query === '' ? '' : `?${query}`;
}

// --- Queries ----------------------------------------------------------------

export const useDashboard = (): UseQueryResult<DashboardView, Error> =>
  useQuery({
    queryKey: keys.dashboard,
    queryFn: ({ signal }) => get<DashboardView>('/dashboard', signal),
    // The dashboard is a live operational view; a minute of staleness is plenty.
    refetchInterval: 60_000,
  });

export const useOccupancy = (): UseQueryResult<OccupancyView, Error> =>
  useQuery({
    queryKey: keys.occupancy,
    queryFn: ({ signal }) => get<OccupancyView>('/occupancy', signal),
  });

export const useSettings = (): UseQueryResult<SettingsView, Error> =>
  useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => get<SettingsView>('/settings', signal),
  });

export const useFloors = (): UseQueryResult<FloorView[], Error> =>
  useQuery({ queryKey: keys.floors, queryFn: ({ signal }) => get<FloorView[]>('/floors', signal) });

export const useRooms = (): UseQueryResult<RoomView[], Error> =>
  useQuery({ queryKey: keys.rooms, queryFn: ({ signal }) => get<RoomView[]>('/rooms', signal) });

export const useResidents = (filters: {
  status?: string;
  search?: string;
}): UseQueryResult<ResidentSummaryView[], Error> =>
  useQuery({
    queryKey: keys.residents(filters),
    queryFn: ({ signal }) => get<ResidentSummaryView[]>(`/residents${toQuery(filters)}`, signal),
  });

export const useResident = (id: string): UseQueryResult<ResidentDetailView, Error> =>
  useQuery({
    queryKey: keys.resident(id),
    queryFn: ({ signal }) => get<ResidentDetailView>(`/residents/${id}`, signal),
  });

export const useInvoices = (filters: {
  periodKey?: string;
  status?: string;
  search?: string;
}): UseQueryResult<InvoiceSummaryView[], Error> =>
  useQuery({
    queryKey: keys.invoices(filters),
    queryFn: ({ signal }) => get<InvoiceSummaryView[]>(`/invoices${toQuery(filters)}`, signal),
  });

export const useInvoice = (id: string): UseQueryResult<InvoiceDetailView, Error> =>
  useQuery({
    queryKey: keys.invoice(id),
    queryFn: ({ signal }) => get<InvoiceDetailView>(`/invoices/${id}`, signal),
  });

export const usePayments = (search?: string): UseQueryResult<PaymentView[], Error> =>
  useQuery({
    queryKey: keys.payments(search),
    queryFn: ({ signal }) => get<PaymentView[]>(`/payments${toQuery({ search })}`, signal),
  });

export const useElectricity = (filters: {
  periodKey?: string;
  roomId?: string;
}): UseQueryResult<MeterReadingView[], Error> =>
  useQuery({
    queryKey: keys.electricity(filters),
    queryFn: ({ signal }) => get<MeterReadingView[]>(`/electricity${toQuery(filters)}`, signal),
  });

export const useMenu = (): UseQueryResult<MenuDayView[], Error> =>
  useQuery({
    queryKey: keys.menu,
    queryFn: ({ signal }) => get<MenuDayView[]>('/mess/menu', signal),
  });

export const useMealCounts = (date?: string): UseQueryResult<MealCountView, Error> =>
  useQuery({
    queryKey: keys.mealCounts(date),
    queryFn: ({ signal }) => get<MealCountView>(`/mess/counts${toQuery({ date })}`, signal),
  });

export const useComplaints = (filters: {
  status?: string;
  category?: string;
}): UseQueryResult<ComplaintSummaryView[], Error> =>
  useQuery({
    queryKey: keys.complaints(filters),
    queryFn: ({ signal }) => get<ComplaintSummaryView[]>(`/complaints${toQuery(filters)}`, signal),
  });

export const useComplaint = (id: string): UseQueryResult<ComplaintDetailView, Error> =>
  useQuery({
    queryKey: keys.complaint(id),
    queryFn: ({ signal }) => get<ComplaintDetailView>(`/complaints/${id}`, signal),
  });

export const useNotices = (): UseQueryResult<NoticeView[], Error> =>
  useQuery({
    queryKey: keys.notices,
    queryFn: ({ signal }) => get<NoticeView[]>('/notices', signal),
  });

export const useStaff = (): UseQueryResult<StaffView[], Error> =>
  useQuery({ queryKey: keys.staff, queryFn: ({ signal }) => get<StaffView[]>('/staff', signal) });

export const useInventory = (): UseQueryResult<InventoryItemView[], Error> =>
  useQuery({
    queryKey: keys.inventory,
    queryFn: ({ signal }) => get<InventoryItemView[]>('/inventory', signal),
  });

export const useExpenses = (
  periodKey?: string,
): UseQueryResult<{ expenses: ExpenseView[]; totalPaise: number }, Error> =>
  useQuery({
    queryKey: keys.expenses(periodKey),
    queryFn: ({ signal }) =>
      get<{ expenses: ExpenseView[]; totalPaise: number }>(
        `/expenses${toQuery({ periodKey })}`,
        signal,
      ),
  });

export const useReminders = (): UseQueryResult<ReminderEventView[], Error> =>
  useQuery({
    queryKey: keys.reminders,
    queryFn: ({ signal }) => get<ReminderEventView[]>('/reminders', signal),
  });

// --- Mutations --------------------------------------------------------------

/**
 * Wraps a write and invalidates the affected caches.
 *
 * Listing what a mutation touches is deliberate: an over-broad invalidation
 * refetches the world on every keystroke, and a missing one leaves the operator
 * looking at a number that is no longer true.
 */
function useOwnerMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  // `readonly` on the inner arrays too: the keys above are `as const` tuples.
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

const OCCUPANCY_KEYS = [keys.floors, keys.rooms, keys.occupancy, keys.dashboard];

export const useCreateFloor = () =>
  useOwnerMutation((body: unknown) => send<FloorView>('/floors', 'POST', body), OCCUPANCY_KEYS);

export const useUpdateFloor = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; name?: string; level?: number }) =>
      send<FloorView>(`/floors/${id}`, 'PATCH', body),
    OCCUPANCY_KEYS,
  );

export const useDeleteFloor = () =>
  useOwnerMutation((id: string) => send<unknown>(`/floors/${id}`, 'DELETE'), OCCUPANCY_KEYS);

export const useCreateRoom = () =>
  useOwnerMutation((body: unknown) => send<RoomView>('/rooms', 'POST', body), OCCUPANCY_KEYS);

export const useUpdateRoom = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      send<RoomView>(`/rooms/${id}`, 'PATCH', body),
    OCCUPANCY_KEYS,
  );

export const useDeleteRoom = () =>
  useOwnerMutation((id: string) => send<unknown>(`/rooms/${id}`, 'DELETE'), OCCUPANCY_KEYS);

export const useUpdateBedStatus = () =>
  useOwnerMutation(
    ({ id, status }: { id: string; status: string }) =>
      send<RoomView>(`/beds/${id}/status`, 'PATCH', { status }),
    OCCUPANCY_KEYS,
  );

export const useCreateResident = () =>
  useOwnerMutation(
    (body: unknown) => send<ResidentSummaryView>('/residents', 'POST', body),
    [...OCCUPANCY_KEYS, ['owner', 'residents']],
  );

export const useUpdateResident = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      send<ResidentSummaryView>(`/residents/${id}`, 'PATCH', body),
    [...OCCUPANCY_KEYS, ['owner', 'residents'], ['owner', 'resident']],
  );

export const useMoveResident = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; toBedId: string; reason?: string }) =>
      send<ResidentSummaryView>(`/residents/${id}/move`, 'POST', body),
    [...OCCUPANCY_KEYS, ['owner', 'residents'], ['owner', 'resident']],
  );

export const useExitResident = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; actualExitDate: string; reason?: string }) =>
      send<ResidentSummaryView>(`/residents/${id}/exit`, 'POST', body),
    [...OCCUPANCY_KEYS, ['owner', 'residents'], ['owner', 'resident']],
  );

const BILLING_KEYS = [
  ['owner', 'invoices'],
  ['owner', 'invoice'],
  ['owner', 'residents'],
  keys.dashboard,
];

export const useGenerateInvoices = () =>
  useOwnerMutation(
    (periodKey: string) =>
      send<{ created: number; skipped: number }>('/invoices/generate', 'POST', { periodKey }),
    BILLING_KEYS,
  );

export const useAddInvoiceItem = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; kind: string; description: string; amountPaise: number }) =>
      send<InvoiceDetailView>(`/invoices/${id}/items`, 'POST', body),
    BILLING_KEYS,
  );

export const useWaiveLateFee = () =>
  useOwnerMutation(
    ({ id, waived }: { id: string; waived: boolean }) =>
      send<InvoiceDetailView>(`/invoices/${id}/late-fee-waiver`, 'POST', { waived }),
    BILLING_KEYS,
  );

export const useRecordPayment = () =>
  useOwnerMutation(
    (body: unknown) => send<PaymentView>('/payments', 'POST', body),
    [...BILLING_KEYS, ['owner', 'payments']],
  );

export const useRecordReading = () =>
  useOwnerMutation(
    (body: unknown) => send<MeterReadingView>('/electricity', 'POST', body),
    [['owner', 'electricity'], ...BILLING_KEYS],
  );

export const useUpdateMenu = () =>
  useOwnerMutation((body: unknown) => send<MenuDayView[]>('/mess/menu', 'PUT', body), [keys.menu]);

export const useUpdateMealTiming = () =>
  useOwnerMutation((body: unknown) => send<unknown>('/mess/timings', 'PUT', body), [keys.settings]);

export const useUpdateComplaint = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; status?: string; note?: string }) =>
      send<ComplaintDetailView>(`/complaints/${id}`, 'PATCH', body),
    [['owner', 'complaints'], ['owner', 'complaint'], keys.dashboard],
  );

export const useUpdateSettings = () =>
  useOwnerMutation(
    (body: unknown) => send<SettingsView>('/settings', 'PATCH', body),
    [keys.settings],
  );

export const useUpdatePropertyProfile = () =>
  useOwnerMutation(
    (body: unknown) => send<SettingsView>('/property', 'PATCH', body),
    [keys.settings],
  );

export const useCreateNotice = () =>
  useOwnerMutation((body: unknown) => send<NoticeView>('/notices', 'POST', body), [keys.notices]);

export const useDeleteNotice = () =>
  useOwnerMutation((id: string) => send<unknown>(`/notices/${id}`, 'DELETE'), [keys.notices]);

export const useCreateStaff = () =>
  useOwnerMutation((body: unknown) => send<StaffView[]>('/staff', 'POST', body), [keys.staff]);

export const useMarkStaffAttendance = () =>
  useOwnerMutation(
    ({ id, ...body }: { id: string; date: string; status: string }) =>
      send<StaffView[]>(`/staff/${id}/attendance`, 'POST', body),
    [keys.staff],
  );

export const useCreateInventoryItem = () =>
  useOwnerMutation(
    (body: unknown) => send<InventoryItemView[]>('/inventory', 'POST', body),
    [keys.inventory],
  );

export const useDeleteInventoryItem = () =>
  useOwnerMutation((id: string) => send<unknown>(`/inventory/${id}`, 'DELETE'), [keys.inventory]);

export const useCreateExpense = () =>
  useOwnerMutation(
    (body: unknown) => send<unknown>('/expenses', 'POST', body),
    [['owner', 'expenses']],
  );

export const useDeleteExpense = () =>
  useOwnerMutation(
    (id: string) => send<unknown>(`/expenses/${id}`, 'DELETE'),
    [['owner', 'expenses']],
  );

/** Looks a person up by email so an existing account is reused, not duplicated. */
export async function lookupUserByEmail(email: string): Promise<{
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hasActiveTenancy: boolean;
} | null> {
  return get(`/residents/lookup${toQuery({ email })}`);
}
