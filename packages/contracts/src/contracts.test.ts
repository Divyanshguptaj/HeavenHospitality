import { describe, expect, it } from 'vitest';

import { ERROR_CODES, ERROR_STATUS } from './errors.js';
import { buildPaginationMeta, paginationQuerySchema, MAX_PAGE_SIZE } from './http.js';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, roleHasPermission } from './roles.js';
import { paiseSchema, periodKeySchema, phoneSchema, slugSchema } from './primitives.js';

describe('error codes', () => {
  it('maps every code to an HTTP status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code], `missing status for ${code}`).toBeGreaterThanOrEqual(400);
    }
  });

  it('returns NOT_FOUND rather than FORBIDDEN for unauthorized resources', () => {
    // Existence must never be confirmed to someone who may not see the record.
    expect(ERROR_STATUS.NOT_FOUND).toBe(404);
  });
});

describe('pagination', () => {
  it('applies defaults when the client sends nothing', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('coerces query-string values', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it('caps page size so a client cannot request the whole table', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: MAX_PAGE_SIZE + 1 })).toThrow();
  });

  it('always reports at least one page, even when empty', () => {
    const meta = buildPaginationMeta({ page: 1, pageSize: 25 }, 0);
    expect(meta.totalPages).toBe(1);
    expect(meta.totalItems).toBe(0);
  });

  it('rounds partial pages up', () => {
    expect(buildPaginationMeta({ page: 1, pageSize: 25 }, 26).totalPages).toBe(2);
  });
});

describe('role matrix', () => {
  it('grants the owner every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission('OWNER', permission)).toBe(true);
    }
  });

  it('never grants a tenant an operational permission', () => {
    const tenantPermissions = ROLE_PERMISSIONS.TENANT;
    expect(tenantPermissions).toEqual(['self:read', 'self:write']);
    expect(roleHasPermission('TENANT', 'invoice:write')).toBe(false);
    expect(roleHasPermission('TENANT', 'tenancy:read')).toBe(false);
  });

  it('does not let staff move money or change settings', () => {
    for (const permission of [
      'payment:refund',
      'deposit:adjust',
      'settings:write',
      'staff:write',
      'tenancy:settle',
    ] as const) {
      expect(roleHasPermission('STAFF', permission)).toBe(false);
    }
  });

  it('does not let a manager read the audit log or manage staff accounts', () => {
    expect(roleHasPermission('MANAGER', 'audit:read')).toBe(false);
    expect(roleHasPermission('MANAGER', 'staff:write')).toBe(false);
  });

  it('only ever references declared permissions', () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe('phone normalisation', () => {
  it('normalises every accepted spelling to one stored form', () => {
    for (const input of [
      '9876543210',
      '09876543210',
      '+919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
    ]) {
      expect(phoneSchema.parse(input)).toBe('+919876543210');
    }
  });

  it('rejects numbers that are not valid Indian mobiles', () => {
    for (const input of ['1234567890', '98765', '+1 555 0100', 'not-a-number']) {
      expect(() => phoneSchema.parse(input)).toThrow();
    }
  });
});

describe('money at the API boundary', () => {
  it('rejects a fractional paise amount before it reaches the money layer', () => {
    expect(() => paiseSchema.parse(100.5)).toThrow();
  });

  it('rejects an implausibly large amount', () => {
    expect(() => paiseSchema.parse(5_000_000_000)).toThrow();
  });

  it('rejects an implausibly large NEGATIVE amount', () => {
    // Without a lower bound this passes Zod and then throws MoneyError deeper in,
    // surfacing as a 500 rather than the 400 the validation layer exists to give.
    expect(() => paiseSchema.parse(-5_000_000_000)).toThrow();
  });

  it('still allows ordinary negative amounts for credits and reversals', () => {
    expect(paiseSchema.parse(-25_000)).toBe(-25_000);
  });

  it('accepts a normal rent amount in paise', () => {
    expect(paiseSchema.parse(800_000)).toBe(800_000);
  });
});

describe('period keys and slugs', () => {
  it('accepts valid billing periods', () => {
    expect(periodKeySchema.parse('2026-08')).toBe('2026-08');
    expect(periodKeySchema.parse('2026-12')).toBe('2026-12');
  });

  it('rejects an impossible month', () => {
    expect(() => periodKeySchema.parse('2026-13')).toThrow();
    expect(() => periodKeySchema.parse('2026-00')).toThrow();
  });

  it('accepts and lowercases property slugs', () => {
    expect(slugSchema.parse('Heaven-Hostel-1')).toBe('heaven-hostel-1');
  });

  it('rejects slugs that would not be URL-safe', () => {
    expect(() => slugSchema.parse('heaven hostel')).toThrow();
    expect(() => slugSchema.parse('-leading')).toThrow();
  });
});
