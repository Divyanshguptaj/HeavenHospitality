import type { Permission } from '@heaven/contracts';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore, userHasPermission } from '../auth/authStore';

/**
 * Console navigation.
 *
 * Entries are filtered by permission so an operator is not shown doors they
 * cannot open — a UX affordance, never the security boundary. The server
 * authorises every request independently.
 */
const NAV_SECTIONS: ReadonlyArray<{
  readonly label: string;
  readonly to: string;
  readonly permission: Permission;
  readonly end?: boolean;
}> = [
  { label: 'Dashboard', to: '/', permission: 'property:read', end: true },
  { label: 'Occupancy', to: '/occupancy', permission: 'property:read' },
  { label: 'Residents', to: '/residents', permission: 'resident:read' },
  { label: 'Billing', to: '/billing', permission: 'invoice:read' },
  { label: 'Payments', to: '/payments', permission: 'payment:read' },
  { label: 'Electricity', to: '/electricity', permission: 'electricity:read' },
  { label: 'Mess', to: '/mess', permission: 'mess:read' },
  { label: 'Complaints', to: '/complaints', permission: 'complaint:read' },
  { label: 'Operations', to: '/operations', permission: 'staff:manage' },
  { label: 'Settings', to: '/settings', permission: 'settings:read' },
];

export function AppShell() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const visible = NAV_SECTIONS.filter((section) => userHasPermission(user, section.permission));

  async function handleSignOut(): Promise<void> {
    await signOut();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <nav
        aria-label="Main"
        className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      >
        <div className="px-2 pb-4 pt-1">
          <span className="text-md font-semibold text-[var(--color-text-primary)]">
            Heaven Hospitality
          </span>
          <p className="text-xs text-[var(--color-text-muted)]">
            {user?.memberships[0]?.propertyName ?? 'Operations'}
          </p>
        </div>

        <ul className="flex flex-1 flex-col gap-0.5">
          {visible.map((section) => (
            <li key={section.to}>
              <NavLink
                to={section.to}
                end={section.end ?? false}
                className={({ isActive }) =>
                  [
                    'block rounded-md px-2 py-1.5 text-sm',
                    isActive
                      ? 'bg-[var(--color-primary-subtle)] font-medium text-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]',
                  ].join(' ')
                }
              >
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {user !== null && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="px-2 text-sm font-medium text-[var(--color-text-primary)]">
              {user.fullName}
            </p>
            <p className="px-2 text-xs text-[var(--color-text-muted)]">{user.role}</p>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            >
              Sign out
            </button>
          </div>
        )}
      </nav>

      <main className="min-w-0 flex-1 overflow-x-hidden p-6">
        <Outlet />
      </main>
    </div>
  );
}
