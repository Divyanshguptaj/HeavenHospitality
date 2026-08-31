import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { phoneNumberSchema } from '@heaven/contracts';

import { canAccessConsole, useAuthStore } from '../auth/authStore';
import { ApiRequestError } from '../lib/apiClient';

// The same phone schema the API validates with, so the console cannot accept a
// format the server would reject — or normalise it differently.
const loginSchema = z.object({
  phone: phoneNumberSchema,
  password: z.string().min(1, 'Enter your password'),
});

type LoginForm = z.infer<typeof loginSchema>;

/**
 * Admin sign-in.
 *
 * There is no self-registration and no public password reset: staff accounts are
 * provisioned by the owner. See docs/0003-auth-and-sessions.md.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginForm): Promise<void> {
    setFormError(null);
    try {
      const user = await signIn(values.phone, values.password);

      // A resident has a valid account but no place in the operations console.
      // Signing them straight back out avoids a half-usable session.
      if (!canAccessConsole(user)) {
        await signOut();
        setFormError(
          'This account is a resident account. Please use the Heaven Hospitality mobile app.',
        );
        return;
      }

      void navigate('/', { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not sign in. Please check your connection and try again.',
      );
    }
  }

  const fieldClass =
    'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] ' +
    'px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Heaven Hospitality
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Operations console</p>
        </div>

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="phone"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              autoFocus
              className={fieldClass}
              aria-invalid={errors.phone !== undefined}
              aria-describedby={errors.phone !== undefined ? 'phone-error' : undefined}
              {...register('phone')}
            />
            {errors.phone !== undefined && (
              <p id="phone-error" className="text-xs text-[var(--color-danger)]">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={fieldClass}
              aria-invalid={errors.password !== undefined}
              aria-describedby={errors.password !== undefined ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password !== undefined && (
              <p id="password-error" className="text-xs text-[var(--color-danger)]">
                {errors.password.message}
              </p>
            )}
          </div>

          {formError !== null && (
            <div
              role="alert"
              className="rounded-md bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          Accounts are created by the property owner. Contact them if you cannot sign in.
        </p>
      </div>
    </main>
  );
}
