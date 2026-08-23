import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { AppShell } from './app/AppShell';
import { queryClient } from './lib/queryClient';
import { SystemStatusPage } from './pages/SystemStatusPage';
import './styles/global.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/system" replace /> },
      { path: 'system', element: <SystemStatusPage /> },
      // Domain routes mount here as their vertical slices land.
    ],
  },
]);

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
