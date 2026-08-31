import { roleHasPermission, type Permission, type Role } from '@heaven/contracts';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../errors/AppError.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

/** Who is making this request, and where they hold authority. */
export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  /** The account role — what the account may do at all. */
  readonly role: Role;
  /** Where it holds authority, for property-scoped checks. */
  readonly roles: ReadonlyArray<{ readonly propertyId: string; readonly role: Role }>;
}

function readBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (header === undefined) return null;

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') return null;

  return token;
}

/**
 * Populates `req.actor` from a Bearer token, or rejects.
 *
 * This establishes *identity only*. It never decides what the actor may do — that
 * is `requirePermission` and, for anything property-scoped, the service layer.
 */
export function requireAuth(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readBearerToken(req);
    if (token === null) {
      next(new AppError('UNAUTHENTICATED', 'Authentication is required.'));
      return;
    }

    verifyAccessToken(token)
      .then((claims) => {
        req.actor = {
          userId: claims.sub,
          sessionId: claims.sid,
          // Tokens issued before `role` existed have none. Treating that as
          // the least privilege is the only safe default: NON_RESIDENT holds no
          // permissions at all, so an old token grants exactly what a guest has.
          role: claims.role ?? 'NON_RESIDENT',
          roles: claims.roles ?? [],
        };
        next();
      })
      .catch(next);
  };
}

export function getActor(req: Request): Actor {
  if (req.actor === undefined) {
    throw new Error(
      'getActor() called on a route without requireAuth() — this is a wiring bug, not a user error.',
    );
  }
  return req.actor;
}

/**
 * Requires one of `allowed` as the actor's account role.
 *
 * This is the coarse "may this kind of account touch this route at all" gate —
 * `requireRole('ADMIN')` on an admin-only endpoint. It is enforced here, on the
 * server, because hiding a button in the client hides nothing: the endpoint is
 * still one curl away.
 */
export function requireRole(...allowed: readonly Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = getActor(req);

    if (!allowed.includes(actor.role)) {
      next(
        new AppError('INSUFFICIENT_PERMISSION', 'You do not have access to perform this action.', {
          context: { required: allowed, actual: actor.role, userId: actor.userId },
        }),
      );
      return;
    }

    next();
  };
}

/**
 * Requires that the actor holds `permission` at **some** property.
 *
 * This is a coarse gate that keeps obviously-unauthorised traffic out of the
 * service layer. It is NOT sufficient on its own: holding `invoice:read` at
 * property A must not grant access to property B's invoices, so every
 * property-scoped service still calls `assertPropertyAccess`. Route guards are
 * convenience; the service layer is the mechanism.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = getActor(req);

    const permitted = actor.roles.some((assignment) =>
      roleHasPermission(assignment.role, permission),
    );

    if (!permitted) {
      next(
        new AppError('INSUFFICIENT_PERMISSION', 'You do not have access to perform this action.', {
          context: { permission, userId: actor.userId },
        }),
      );
      return;
    }

    next();
  };
}

/**
 * Asserts the actor holds `permission` **at that specific property**.
 *
 * This is the check that stops IDOR. Services call it with the property id of the
 * resource actually being touched — never with an id taken straight from the
 * request body without first resolving the resource.
 *
 * Failure is reported as NOT_FOUND, not FORBIDDEN: a 403 confirms the resource
 * exists and lets an attacker enumerate other properties' data.
 */
export function assertPropertyAccess(
  actor: Actor,
  propertyId: string,
  permission: Permission,
): void {
  const assignment = actor.roles.find((candidate) => candidate.propertyId === propertyId);

  if (assignment === undefined || !roleHasPermission(assignment.role, permission)) {
    throw new AppError('NOT_FOUND', 'Not found.', {
      context: { propertyId, permission, userId: actor.userId },
    });
  }
}

/** True when the actor holds the permission anywhere — for shaping responses, not for access control. */
export function hasPermissionAnywhere(actor: Actor, permission: Permission): boolean {
  return actor.roles.some((assignment) => roleHasPermission(assignment.role, permission));
}
