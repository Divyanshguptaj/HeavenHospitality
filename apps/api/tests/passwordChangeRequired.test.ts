import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import { requireAuth } from '../src/middleware/authenticate.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';

const roles = [{ propertyId: 'p1', role: 'RESIDENT' as const }];

async function run(
  middleware: ReturnType<typeof requireAuth>,
  passwordChangeRequired: boolean,
): Promise<{ error: unknown; actor: unknown }> {
  const token = await signAccessToken('user-1', 'session-1', 'RESIDENT', {
    memberships: roles,
    passwordChangeRequired,
  });
  const req = { get: () => `Bearer ${token}` } as unknown as Request;

  return new Promise((resolve) => {
    const next: NextFunction = (error?: unknown) => {
      resolve({ error, actor: req.actor });
    };
    middleware(req, {} as Response, next);
  });
}

describe('accounts on a temporary password', () => {
  it('are refused on an ordinary route', async () => {
    const { error } = await run(requireAuth(), true);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('may reach a route that allows it, such as changing the password', async () => {
    const { error, actor } = await run(requireAuth({ allowPasswordChangeRequired: true }), true);

    expect(error).toBeUndefined();
    expect(actor).toMatchObject({ userId: 'user-1' });
  });

  it('are not restricted once the password has been changed', async () => {
    const { error } = await run(requireAuth(), false);

    expect(error).toBeUndefined();
  });
});
