import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

/**
 * The owner console's design system.
 *
 * Information-dense but calm: restrained colour, one radius scale, no gradients,
 * no decorative charts. Every colour comes from the design tokens
 * (`--color-*`), so nothing is a one-off hex value.
 *
 * Every screen composes these rather than styling from scratch — that is what
 * keeps twelve screens looking like one product.
 */

// --- Page scaffolding -------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
        {description !== undefined && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = '',
  title,
  actions,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly title?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {(title !== undefined || actions !== undefined) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          {title !== undefined && (
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
          )}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A single headline number. Deliberately plain — no sparkline, no gradient. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | undefined;
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneColor: Record<NonNullable<typeof tone>, string> = {
    neutral: 'var(--color-text-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular" style={{ color: toneColor[tone] }}>
        {value}
      </p>
      {hint !== undefined && (
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{hint}</p>
      )}
    </div>
  );
}

// --- Controls ---------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] border-transparent',
    secondary:
      'bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] border-[var(--color-border-strong)]',
    danger:
      'bg-[var(--color-danger)] text-[var(--color-text-inverse)] hover:bg-[var(--color-danger-hover)] border-transparent',
    ghost:
      'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border-transparent',
  };

  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}

const FIELD_CLASS =
  'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 ' +
  'text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] ' +
  'disabled:opacity-60';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-[var(--color-text-secondary)]">
        {label}
      </label>
      {children}
      {/* Hint is hidden once there is an error: two messages under one field is
          noise, and the error is the one that matters. */}
      {error !== undefined ? (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      ) : hint !== undefined ? (
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD_CLASS} ${className}`} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD_CLASS} ${className}`} />;
}

export function Textarea({ className = '', ...props }: InputHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...(props as Record<string, unknown>)}
      className={`${FIELD_CLASS} min-h-20 ${className}`}
    />
  );
}

// --- Status -----------------------------------------------------------------

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Status is never colour alone — every badge carries its label as text, which is
 * what makes it readable to a screen reader and to a colour-blind operator.
 */
export function Badge({
  label,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly tone?: BadgeTone;
}) {
  const styles: Record<BadgeTone, string> = {
    neutral: 'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]',
    success: 'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
    info: 'bg-[var(--color-info-subtle)] text-[var(--color-info)]',
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

/** Shared status→tone mapping so a status never looks different on two screens. */
export function invoiceTone(status: string): BadgeTone {
  if (status === 'PAID') return 'success';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PARTIALLY_PAID') return 'warning';
  if (status === 'CANCELLED') return 'neutral';
  return 'info';
}

export function bedTone(status: string): BadgeTone {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'OCCUPIED') return 'info';
  return 'warning';
}

export function complaintTone(status: string): BadgeTone {
  if (status === 'OPEN') return 'danger';
  if (status === 'IN_PROGRESS') return 'warning';
  if (status === 'RESOLVED') return 'success';
  return 'neutral';
}

// --- Table ------------------------------------------------------------------

export function Table({ children }: { readonly children: ReactNode }) {
  // Wide tables scroll inside their own container so the page never scrolls
  // sideways.
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children = null,
  align = 'left',
}: {
  readonly children?: ReactNode;
  readonly align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`border-b border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children = null,
  align = 'left',
  className = '',
}: {
  readonly children?: ReactNode;
  readonly align?: 'left' | 'right';
  readonly className?: string;
}) {
  return (
    <td
      className={`border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] ${
        align === 'right' ? 'text-right' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

// --- States -----------------------------------------------------------------

export function LoadingRows({ rows = 5 }: { readonly rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-1">
      {Array.from({ length: rows }, (_unused, index) => (
        <div key={index} className="h-8 animate-pulse rounded bg-[var(--color-surface-subtle)]" />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-danger)]">Something went wrong</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{message}</p>
      </div>
      {onRetry !== undefined && (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** An empty state says what to do next, not merely that there is nothing here. */
export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
      {description !== undefined && (
        <p className="max-w-md text-sm text-[var(--color-text-secondary)]">{description}</p>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}

// --- Dialog -----------------------------------------------------------------

/**
 * A modal, used sparingly: for creating something small or confirming something
 * destructive. Anything larger belongs on its own page.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      {/* Clicking the backdrop closes; clicking the panel must not. */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close dialog">
            ✕
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer !== undefined && (
          <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** A destructive action always states what will happen before it happens. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  busy = false,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
    </Dialog>
  );
}

// --- Formatting -------------------------------------------------------------

/** Renders a date string (YYYY-MM-DD or ISO) in a compact, unambiguous form. */
export function formatDate(value: string | null): string {
  if (value === null || value === '') return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** "2026-08" → "August 2026". */
export function formatPeriod(periodKey: string): string {
  const [year, month] = periodKey.split('-').map(Number);
  if (year === undefined || month === undefined) return periodKey;
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}
