import type { Permission } from '@heaven/contracts';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore, userHasPermission } from '../auth/authStore';

/**
 * Admin navigation.
 *
 * Entries are filtered by permission so an operator is not shown doors they
 * cannot open — a UX affordance, never the security boundary. `ready: false`
 * marks sections whose vertical slice has not landed; they render visibly
 * disabled rather than hidden, so the shape of the product is legible.
 */
const NAV_SECTIONS: ReadonlyArray<{
  readonly label: string;
  readonly to: string;
  readonly ready: boolean;
  readonly permission: Permission;
}> = [
  { label: 'Dashboard', to: '/', ready: false, permission: 'property:read' },
  { label: 'Property', to: '/property', ready: false, permission: 'property:read' },
  { label: 'Tenants', to: '/tenants', ready: false, permission: 'tenancy:read' },
  { label: 'Billing', to: '/billing', ready: false, permission: 'invoice:read' },
  { label: 'Electricity', to: '/electricity', ready: false, permission: 'electricity:read' },
  { label: 'Mess', to: '/mess', ready: false, permission: 'mess:read' },
  { label: 'Complaints', to: '/complaints', ready: false, permission: 'complaint:read' },
  { label: 'Reports', to: '/reports', ready: false, permission: 'report:read' },
  { label: 'System', to: '/system', ready: true, permission: 'property:read' },
];

export function AppShell() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const visibleSections = NAV_SECTIONS.filter((section) =>
    userHasPermission(user, section.permission),
  );

  async function handleSignOut(): Promise<void> {
    await signOut();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Main"
        className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      >
        <div className="px-2 pb-4 pt-1">
          <span className="text-md font-semibold text-[var(--color-text-primary)]">
            Heaven Hospitality
          </span>
          <p className="text-xs text-[var(--color-text-muted)]">Operations</p>
        </div>

        <ul className="flex flex-1 flex-col gap-0.5">
          {visibleSections.map((section) =>
            section.ready ? (
              <li key={section.to}>
                <NavLink
                  to={section.to}
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
            ) : (
              <li key={section.to}>
                <span
                  aria-disabled="true"
                  title="Not built yet"
                  className="block cursor-not-allowed rounded-md px-2 py-1.5 text-sm text-[var(--color-text-muted)] opacity-60"
                >
                  {section.label}
                </span>
              </li>
            ),
          )}
        </ul>

        {user !== null && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="px-2 text-sm font-medium text-[var(--color-text-primary)]">
              {user.fullName}
            </p>
            <p className="px-2 text-xs text-[var(--color-text-muted)]">
              {user.primaryRole}
              {user.memberships[0] !== undefined && ` · ${user.memberships[0].propertyName}`}
            </p>
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

      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
