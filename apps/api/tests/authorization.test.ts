import { PERMISSIONS, ROLE_PERMISSIONS } from '@heaven/contracts';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import {
  assertPropertyAccess,
  hasPermissionAnywhere,
  type Actor,
} from '../src/middleware/authenticate.js';

const PROPERTY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROPERTY_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const actorAt = (propertyId: string, role: Actor['roles'][number]['role']): Actor => ({
  userId: 'user-1',
  sessionId: 'session-1',
  roles: [{ propertyId, role }],
});

describe('assertPropertyAccess — the IDOR boundary', () => {
  it('allows an owner to act on their own property', () => {
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'OWNER'), PROPERTY_A, 'invoice:write'),
    ).not.toThrow();
  });

  it('refuses an owner acting on a property they do not own', () => {
    // The core IDOR case: a valid token, a real permission, the wrong property.
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'OWNER'), PROPERTY_B, 'invoice:write'),
    ).toThrow(AppError);
  });

  it('reports an inaccessible property as NOT_FOUND, never FORBIDDEN', () => {
    // A 403 confirms the record exists and lets an attacker enumerate other
    // properties. See docs/0004-authorization.md.
    try {
      assertPropertyAccess(actorAt(PROPERTY_A, 'OWNER'), PROPERTY_B, 'invoice:write');
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
    const stranger: Actor = { userId: 'u', sessionId: 's', roles: [] };
    expect(() => assertPropertyAccess(stranger, PROPERTY_A, 'property:read')).toThrow(AppError);
  });

  it('scopes each membership independently', () => {
    // Owning one property must not confer ownership of another where the same
    // person merely lives.
    const actor: Actor = {
      userId: 'user-1',
      sessionId: 'session-1',
      roles: [
        { propertyId: PROPERTY_A, role: 'OWNER' },
        { propertyId: PROPERTY_B, role: 'RESIDENT' },
      ],
    };

    expect(() => assertPropertyAccess(actor, PROPERTY_A, 'invoice:write')).not.toThrow();
    expect(() => assertPropertyAccess(actor, PROPERTY_B, 'invoice:write')).toThrow(AppError);
  });
});

describe('role capability matrix', () => {
  it('gives the owner every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.OWNER).toContain(permission);
    }
  });

  it('grants a resident only self-scoped permissions', () => {
    expect([...ROLE_PERMISSIONS.RESIDENT]).toEqual(['self:read', 'self:write']);
  });

  it('defines exactly two roles — there is no staff hierarchy', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['OWNER', 'RESIDENT']);
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
    expect(hasPermissionAnywhere(actorAt(PROPERTY_A, 'OWNER'), 'invoice:write')).toBe(true);
  });

  it('is false when no membership grants it', () => {
    expect(hasPermissionAnywhere(actorAt(PROPERTY_A, 'RESIDENT'), 'invoice:write')).toBe(false);
  });
});
