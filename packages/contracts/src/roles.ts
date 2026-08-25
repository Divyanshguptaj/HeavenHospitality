/**
 * Roles and their permissions.
 *
 * Three user types exist (spec §2): OWNER, RESIDENT, and guests — who are simply
 * unauthenticated and hold no role at all. There is deliberately no staff
 * hierarchy: the owner runs the property.
 *
 * This matrix is a frozen constant, not a database table. A runtime permission
 * editor is a feature in its own right and a privilege-escalation surface.
 *
 * Shared by API and admin so the UI hides what the server would reject — but
 * hiding is a UX affordance only. The server checks independently, every time.
 */
export const ROLES = ['OWNER', 'RESIDENT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'property:read',
  'property:write',
  'floor:manage',
  'room:manage',
  'bed:manage',
  'resident:read',
  'resident:write',
  'invoice:read',
  'invoice:write',
  'payment:read',
  'payment:record',
  'electricity:read',
  'electricity:write',
  'mess:read',
  'mess:write',
  'complaint:read',
  'complaint:write',
  'notice:manage',
  'settings:read',
  'settings:write',
  'report:read',
  'staff:manage',
  'inventory:manage',
  'notification:read',
  'audit:read',
  /**
   * Resident-scoped: the holder may act on their OWN records only. Resource
   * ownership is verified separately in the service layer — holding `self:read`
   * never grants access to another resident's data.
   */
  'self:read',
  'self:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const RESIDENT_PERMISSIONS: readonly Permission[] = ['self:read', 'self:write'];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  OWNER: PERMISSIONS,
  RESIDENT: RESIDENT_PERMISSIONS,
});

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
