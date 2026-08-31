import { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from '@heaven/contracts';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import {
  assertPropertyAccess,
  hasPermissionAnywhere,
  requireRole,
  type Actor,
} from '../src/middleware/authenticate.js';

const PROPERTY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROPERTY_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const actorAt = (propertyId: string, role: Actor['role']): Actor => ({
  userId: 'user-1',
  sessionId: 'session-1',
  role,
  roles: [{ propertyId, role }],
});

describe('assertPropertyAccess — the IDOR boundary', () => {
  it('allows an owner to act on their own property', () => {
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'ADMIN'), PROPERTY_A, 'invoice:write'),
    ).not.toThrow();
  });

  it('refuses an owner acting on a property they do not own', () => {
    // The core IDOR case: a valid token, a real permission, the wrong property.
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'ADMIN'), PROPERTY_B, 'invoice:write'),
    ).toThrow(AppError);
  });

  it('reports an inaccessible property as NOT_FOUND, never FORBIDDEN', () => {
    // A 403 confirms the record exists and lets an attacker enumerate other
    // properties. See docs/0004-authorization.md.
    try {
      assertPropertyAccess(actorAt(PROPERTY_A, 'ADMIN'), PROPERTY_B, 'invoice:write');
      throw new Error('expected assertPropertyAccess to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('NOT_FOUND');
      expect((error as AppError).status).toBe(404);
    }
  });

  it('never lets a resident reach operational data', () => {
    // This is the whole point of the role split: a resident holds a real account
    // at a real property and still cannot read anyone else's operations.
    for (const permission of [
      'resident:read',
      'invoice:write',
      'payment:record',
      'report:read',
      'settings:write',
      'room:manage',
      'audit:read',
    ] as const) {
      expect(() =>
        assertPropertyAccess(actorAt(PROPERTY_A, 'RESIDENT'), PROPERTY_A, permission),
      ).toThrow(AppError);
    }
  });

  it('allows a resident their own self-scoped permissions', () => {
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'RESIDENT'), PROPERTY_A, 'self:read'),
    ).not.toThrow();
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'RESIDENT'), PROPERTY_A, 'self:write'),
    ).not.toThrow();
  });

  it('refuses an actor with no memberships at all', () => {
    const stranger: Actor = { userId: 'u', sessionId: 's', role: 'ADMIN', roles: [] };
    expect(() => assertPropertyAccess(stranger, PROPERTY_A, 'property:read')).toThrow(AppError);
  });

  it('scopes each membership independently', () => {
    // Owning one property must not confer ownership of another where the same
    // person merely lives.
    const actor: Actor = {
      userId: 'user-1',
      sessionId: 'session-1',
      role: 'ADMIN',
      roles: [
        { propertyId: PROPERTY_A, role: 'ADMIN' },
        { propertyId: PROPERTY_B, role: 'RESIDENT' },
      ],
    };

    expect(() => assertPropertyAccess(actor, PROPERTY_A, 'invoice:write')).not.toThrow();
    expect(() => assertPropertyAccess(actor, PROPERTY_B, 'invoice:write')).toThrow(AppError);
  });
});

describe('role capability matrix', () => {
  it('gives the admin every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.ADMIN).toContain(permission);
    }
  });

  it('grants a resident only self-scoped permissions', () => {
    expect([...ROLE_PERMISSIONS.RESIDENT]).toEqual(['self:read', 'self:write']);
  });

  it('grants a non-resident nothing at all', () => {
    // The signup default. A non-resident sees only what is already public, so
    // holding an account must grant no more than not holding one.
    expect([...ROLE_PERMISSIONS.NON_RESIDENT]).toEqual([]);

    for (const permission of PERMISSIONS) {
      expect(roleHasPermission('NON_RESIDENT', permission)).toBe(false);
    }
  });

  it('defines exactly three roles — there is no staff hierarchy', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['ADMIN', 'NON_RESIDENT', 'RESIDENT']);
  });

  it('only ever references declared permissions', () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe('hasPermissionAnywhere', () => {
  it('is true when the permission is held at any property', () => {
    expect(hasPermissionAnywhere(actorAt(PROPERTY_A, 'ADMIN'), 'invoice:write')).toBe(true);
  });

  it('is false when no membership grants it', () => {
    expect(hasPermissionAnywhere(actorAt(PROPERTY_A, 'RESIDENT'), 'invoice:write')).toBe(false);
  });
});

describe('requireRole — the owner-only boundary', () => {
  /** Drives the middleware the way Express does, and reports what it passed to next(). */
  function run(actor: Actor | undefined, ...allowed: Array<Actor['role']>): AppError | null {
    const req = { actor } as unknown as Parameters<ReturnType<typeof requireRole>>[0];
    let passed: unknown = null;

    requireRole(...allowed)(
      req,
      {} as never,
      ((error?: unknown) => {
        passed = error ?? null;
      }) as never,
    );

    return passed as AppError | null;
  }

  it('lets an admin through an admin-only route', () => {
    expect(run(actorAt(PROPERTY_A, 'ADMIN'), 'ADMIN')).toBeNull();
  });

  it('refuses a resident on an admin-only route', () => {
    // The case the whole role system exists for. Hiding the button in the app
    // does nothing — this is the check that actually holds.
    const error = run(actorAt(PROPERTY_A, 'RESIDENT'), 'ADMIN');

    expect(error).toBeInstanceOf(AppError);
    expect(error?.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('lets a resident through a route open to both', () => {
    expect(run(actorAt(PROPERTY_A, 'RESIDENT'), 'ADMIN', 'RESIDENT')).toBeNull();
  });

  it('refuses a non-resident on every authenticated route', () => {
    // A freshly signed-up account. It must not reach the resident area either:
    // being registered is not the same as living here.
    for (const allowed of [['ADMIN'], ['RESIDENT'], ['ADMIN', 'RESIDENT']] as const) {
      const nonResident: Actor = {
        userId: 'user-2',
        sessionId: 'session-2',
        role: 'NON_RESIDENT',
        roles: [],
      };

      expect(run(nonResident, ...allowed)?.code).toBe('INSUFFICIENT_PERMISSION');
    }
  });

  it('reads the account role, not the property membership', () => {
    // A resident account holding an ADMIN membership row somewhere must still be
    // refused: the account role is the authoritative one.
    const mismatched: Actor = {
      userId: 'user-1',
      sessionId: 'session-1',
      role: 'RESIDENT',
      roles: [{ propertyId: PROPERTY_A, role: 'ADMIN' }],
    };

    expect(run(mismatched, 'ADMIN')?.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('throws a wiring error when used without requireAuth', () => {
    // A route guarded by requireRole but not requireAuth is a bug in our code,
    // not a rejected user — so it must fail loudly rather than quietly allow.
    expect(() => run(undefined, 'ADMIN')).toThrow(/requireAuth/);
  });
});
