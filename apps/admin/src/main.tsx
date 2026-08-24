import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { AppShell } from './app/AppShell';
import { RequireAuth } from './auth/RequireAuth';
import { useAuthStore } from './auth/authStore';
import { queryClient } from './lib/queryClient';
import { LoginPage } from './pages/LoginPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
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
      { index: true, element: <Navigate to="/system" replace /> },
      { path: 'system', element: <SystemStatusPage /> },
      // Domain routes mount here as their vertical slices land.
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
