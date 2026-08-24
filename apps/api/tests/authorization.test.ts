import { ROLE_PERMISSIONS } from '@heaven/contracts';
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
  it('allows a manager to act on their own property', () => {
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'MANAGER'), PROPERTY_A, 'invoice:write'),
    ).not.toThrow();
  });

  it('refuses a manager acting on a property they do not belong to', () => {
    // The core IDOR case: a valid token, a real permission, the wrong property.
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'MANAGER'), PROPERTY_B, 'invoice:write'),
    ).toThrow(AppError);
  });

  it('reports an inaccessible property as NOT_FOUND, never FORBIDDEN', () => {
    // A 403 confirms the record exists and lets an attacker enumerate other
    // properties. See docs/0004-authorization.md.
    try {
      assertPropertyAccess(actorAt(PROPERTY_A, 'MANAGER'), PROPERTY_B, 'invoice:write');
      throw new Error('expected assertPropertyAccess to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('NOT_FOUND');
      expect((error as AppError).status).toBe(404);
    }
  });

  it('refuses a permission the role does not hold, even at the right property', () => {
    // Staff may record a payment but must not issue a refund.
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'STAFF'), PROPERTY_A, 'payment:record'),
    ).not.toThrow();
    expect(() =>
      assertPropertyAccess(actorAt(PROPERTY_A, 'STAFF'), PROPERTY_A, 'payment:refund'),
    ).toThrow(AppError);
  });

  it('never lets a tenant reach operational data', () => {
    for (const permission of [
      'tenancy:read',
      'invoice:write',
      'payment:record',
      'report:read',
      'settings:write',
    ] as const) {
      expect(() =>
        assertPropertyAccess(actorAt(PROPERTY_A, 'TENANT'), PROPERTY_A, permission),
      ).toThrow(AppError);
    }
  });

  it('refuses an actor with no memberships at all', () => {
    const stranger: Actor = { userId: 'u', sessionId: 's', roles: [] };
    expect(() => assertPropertyAccess(stranger, PROPERTY_A, 'property:read')).toThrow(AppError);
  });

  it('scopes each membership independently for a multi-property actor', () => {
    const actor: Actor = {
      userId: 'user-1',
      sessionId: 'session-1',
      roles: [
        { propertyId: PROPERTY_A, role: 'MANAGER' },
        { propertyId: PROPERTY_B, role: 'TENANT' },
      ],
    };

    // Being a manager somewhere must not confer manager rights everywhere.
    expect(() => assertPropertyAccess(actor, PROPERTY_A, 'invoice:write')).not.toThrow();
    expect(() => assertPropertyAccess(actor, PROPERTY_B, 'invoice:write')).toThrow(AppError);
  });
});

describe('role capability matrix', () => {
  it('gives the owner every permission', () => {
    expect(ROLE_PERMISSIONS.OWNER.length).toBeGreaterThan(ROLE_PERMISSIONS.MANAGER.length);
  });

  it('restricts staff to a strict subset of manager permissions', () => {
    for (const permission of ROLE_PERMISSIONS.STAFF) {
      expect(ROLE_PERMISSIONS.MANAGER, `staff has ${permission} but manager does not`).toContain(
        permission,
      );
    }
    expect(ROLE_PERMISSIONS.STAFF.length).toBeLessThan(ROLE_PERMISSIONS.MANAGER.length);
  });

  it('grants a tenant only self-scoped permissions', () => {
    expect([...ROLE_PERMISSIONS.TENANT]).toEqual(['self:read', 'self:write']);
  });
});

describe('hasPermissionAnywhere', () => {
  it('is true when the permission is held at any property', () => {
    expect(hasPermissionAnywhere(actorAt(PROPERTY_A, 'MANAGER'), 'invoice:write')).toBe(true);
  });

  it('is false when no membership grants it', () => {
    expect(hasPermissionAnywhere(actorAt(PROPERTY_A, 'TENANT'), 'invoice:write')).toBe(false);
  });
});
