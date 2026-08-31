/**
 * Roles and their permissions.
 *
 * Three authenticated roles exist, plus guests — who are simply unauthenticated
 * and hold no role at all:
 *
 *   ADMIN          the person who runs the property (the "PG owner")
 *   RESIDENT       someone currently living here
 *   NON_RESIDENT   a registered account that is not a tenant — the default for
 *                  every account created through the public signup flow
 *
 * NON_RESIDENT deliberately holds NO permissions. Everything a non-resident can
 * see is served by the unauthenticated public endpoints, so a non-resident's
 * token grants exactly what a guest already has: nothing extra. That is what
 * makes "sign up" a zero-privilege act — the frontend cannot ask for a role, and
 * the only path to RESIDENT or ADMIN is an owner/admin action on the server.
 *
 * This matrix is a frozen constant, not a database table. A runtime permission
 * editor is a feature in its own right and a privilege-escalation surface.
 *
 * Shared by API and both clients so the UI hides what the server would reject —
 * but hiding is a UX affordance only. The server checks independently, every time.
 */
export const ROLES = ['ADMIN', 'RESIDENT', 'NON_RESIDENT'] as const;
export type Role = (typeof ROLES)[number];

/** The role every new public signup receives. Never sent by a client. */
export const DEFAULT_SIGNUP_ROLE: Role = 'NON_RESIDENT';

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

/**
 * A non-resident holds nothing. Written as an explicit empty tuple rather than
 * omitted, so adding a role without deciding its permissions is a type error
 * instead of an accidental grant.
 */
const NON_RESIDENT_PERMISSIONS: readonly Permission[] = [];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  ADMIN: PERMISSIONS,
  RESIDENT: RESIDENT_PERMISSIONS,
  NON_RESIDENT: NON_RESIDENT_PERMISSIONS,
});

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Human-readable role names for profile screens. Never used for authorisation. */
export const ROLE_LABELS: Readonly<Record<Role, string>> = Object.freeze({
  ADMIN: 'Owner',
  RESIDENT: 'Resident',
  NON_RESIDENT: 'Guest account',
});
