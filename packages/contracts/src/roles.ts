/**
 * Roles and their permissions.
 *
 * This matrix is a frozen constant rather than a database table. A runtime
 * permission editor is a feature in its own right and a privilege-escalation
 * surface; see docs/0004-authorization.md.
 *
 * Shared by API and admin so the UI hides what the server would reject — but
 * hiding is a UX affordance only. The server checks independently, every time.
 */
export const ROLES = ['OWNER', 'MANAGER', 'STAFF', 'TENANT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'property:read',
  'property:write',
  'room:read',
  'room:write',
  'bed:read',
  'bed:allocate',
  'tenancy:read',
  'tenancy:write',
  'tenancy:settle',
  'invoice:read',
  'invoice:write',
  'payment:read',
  'payment:record',
  'payment:refund',
  'deposit:read',
  'deposit:adjust',
  'electricity:read',
  'electricity:write',
  'mess:read',
  'mess:write',
  'complaint:read',
  'complaint:write',
  'complaint:assign',
  'notification:read',
  'notification:send',
  'report:read',
  'settings:read',
  'settings:write',
  'staff:read',
  'staff:write',
  'audit:read',
  // Tenant-scoped: the holder may act on their own records only. Resource
  // ownership is still verified separately — see docs/0004-authorization.md.
  'self:read',
  'self:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  'property:read',
  'room:read',
  'room:write',
  'bed:read',
  'bed:allocate',
  'tenancy:read',
  'tenancy:write',
  'tenancy:settle',
  'invoice:read',
  'invoice:write',
  'payment:read',
  'payment:record',
  'deposit:read',
  'deposit:adjust',
  'electricity:read',
  'electricity:write',
  'mess:read',
  'mess:write',
  'complaint:read',
  'complaint:write',
  'complaint:assign',
  'notification:read',
  'notification:send',
  'report:read',
  'settings:read',
  'staff:read',
];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'property:read',
  'room:read',
  'bed:read',
  'tenancy:read',
  'invoice:read',
  'payment:read',
  'payment:record',
  'electricity:read',
  'electricity:write',
  'mess:read',
  'mess:write',
  'complaint:read',
  'complaint:write',
];

const TENANT_PERMISSIONS: readonly Permission[] = ['self:read', 'self:write'];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  OWNER: PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
  TENANT: TENANT_PERMISSIONS,
});

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
