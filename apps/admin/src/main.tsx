import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppShell } from './app/AppShell';
import { RequireAuth } from './auth/RequireAuth';
import { useAuthStore } from './auth/authStore';
import { queryClient } from './lib/queryClient';
import { BillingPage } from './pages/BillingPage';
import { ComplaintDetailPage, ComplaintsPage } from './pages/ComplaintsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ElectricityPage } from './pages/ElectricityPage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { LoginPage } from './pages/LoginPage';
import { MessPage } from './pages/MessPage';
import { OccupancyPage } from './pages/OccupancyPage';
import { OperationsPage } from './pages/OperationsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ResidentDetailPage } from './pages/ResidentDetailPage';
import { ResidentsPage } from './pages/ResidentsPage';
import { RoomDetailPage } from './pages/RoomDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import './styles/global.css';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'occupancy', element: <OccupancyPage /> },
      { path: 'rooms/:id', element: <RoomDetailPage /> },
      { path: 'residents', element: <ResidentsPage /> },
      { path: 'residents/:id', element: <ResidentDetailPage /> },
      { path: 'billing', element: <BillingPage /> },
      { path: 'billing/:id', element: <InvoiceDetailPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'electricity', element: <ElectricityPage /> },
      { path: 'mess', element: <MessPage /> },
      { path: 'complaints', element: <ComplaintsPage /> },
      { path: 'complaints/:id', element: <ComplaintDetailPage /> },
      { path: 'operations', element: <OperationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

/**
 * Exchanges the refresh cookie for an access token once, on page load.
 *
 * Access tokens live in memory only, so a reload always starts with none — this
 * is what makes a refresh look like "still signed in" rather than a logout.
 */
function App() {
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  return <RouterProvider router={router} />;
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
