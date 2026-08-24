import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';

import { canAccessConsole, useAuthStore } from './authStore';

/**
 * Route guard for the console.
 *
 * This decides what to **render**, nothing more. Every endpoint behind it
 * authorises independently, so a user who reached a route some other way is still
 * refused by the API. Hiding a screen is not authorization —
 * see docs/0004-authorization.md.
 */
export function RequireAuth({ children }: { readonly children: ReactElement }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === 'restoring') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)]"
      >
        <span className="text-sm text-[var(--color-text-secondary)]">Loading…</span>
      </div>
    );
  }

  if (status === 'signedOut' || !canAccessConsole(user)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
