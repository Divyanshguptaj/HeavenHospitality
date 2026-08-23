import { NavLink, Outlet } from 'react-router-dom';

/**
 * Admin navigation.
 *
 * Sections are listed with `ready: false` until their vertical slice lands, and
 * render as visibly disabled rather than being hidden — an operator can see what
 * the product will do without being able to click into a dead end.
 */
const NAV_SECTIONS: ReadonlyArray<{
  readonly label: string;
  readonly to: string;
  readonly ready: boolean;
}> = [
  { label: 'Dashboard', to: '/', ready: false },
  { label: 'Property', to: '/property', ready: false },
  { label: 'Tenants', to: '/tenants', ready: false },
  { label: 'Billing', to: '/billing', ready: false },
  { label: 'Electricity', to: '/electricity', ready: false },
  { label: 'Mess', to: '/mess', ready: false },
  { label: 'Complaints', to: '/complaints', ready: false },
  { label: 'Reports', to: '/reports', ready: false },
  { label: 'System', to: '/system', ready: true },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Main"
        className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      >
        <div className="px-2 pb-4 pt-1">
          <span className="text-md font-semibold text-[var(--color-text-primary)]">
            Heaven Hospitality
          </span>
          <p className="text-xs text-[var(--color-text-muted)]">Operations</p>
        </div>

        <ul className="flex flex-col gap-0.5">
          {NAV_SECTIONS.map((section) =>
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
      </nav>

      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
