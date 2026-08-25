import type { Permission } from '@heaven/contracts';
import type { PropertySettings } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import { prisma } from '../../lib/prisma.js';
import { assertPropertyAccess, type Actor } from '../../middleware/authenticate.js';

/**
 * Resolves the property an owner request operates on, and authorises it.
 *
 * The application manages one property today, but nothing assumes that: the
 * property id is always resolved and always checked. Because every owner
 * endpoint funnels through here, adding a property switcher later is a change to
 * this file rather than to every service.
 */
export interface PropertyContext {
  readonly propertyId: string;
  readonly timezone: string;
  readonly settings: PropertySettings;
}

/**
 * The actor's property. An owner holds exactly one membership in this build; if
 * they ever hold several, the request must name which one.
 */
function resolvePropertyId(actor: Actor, requested?: string): string {
  if (requested !== undefined) return requested;

  const owned = actor.roles.filter((assignment) => assignment.role === 'OWNER');
  const first = owned[0];

  if (first === undefined) {
    throw new AppError('FORBIDDEN', 'This account does not manage a property.');
  }
  if (owned.length > 1) {
    throw new AppError('VALIDATION_FAILED', 'Specify which property this request applies to.');
  }

  return first.propertyId;
}

export async function getPropertyContext(
  actor: Actor,
  permission: Permission,
  requestedPropertyId?: string,
): Promise<PropertyContext> {
  const propertyId = resolvePropertyId(actor, requestedPropertyId);

  // Authorisation happens here, before any data is read — holding a permission
  // at one property must never grant it at another. See docs/0004.
  assertPropertyAccess(actor, propertyId, permission);

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { timezone: true, settings: true },
  });

  if (property === null) {
    throw new AppError('NOT_FOUND', 'Not found.');
  }

  // Settings are created with the property and are required by every financial
  // calculation; a missing row is a broken install, not a user error.
  if (property.settings === null) {
    throw new AppError('INTERNAL_ERROR', 'Property settings are missing.', {
      context: { propertyId },
    });
  }

  return { propertyId, timezone: property.timezone, settings: property.settings };
}

/**
 * The resident's own tenancy.
 *
 * Resident endpoints resolve their subject from the authenticated user, never
 * from a client-supplied id — which is what makes it impossible for one resident
 * to read another's invoices by changing a parameter.
 */
export async function getActiveTenancyForActor(actor: Actor): Promise<{
  tenancyId: string;
  propertyId: string;
  timezone: string;
  settings: PropertySettings;
}> {
  const tenancy = await prisma.tenancy.findFirst({
    where: { userId: actor.userId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
    orderBy: { joiningDate: 'desc' },
    select: {
      id: true,
      propertyId: true,
      property: { select: { timezone: true, settings: true } },
    },
  });

  if (tenancy === null || tenancy.property.settings === null) {
    throw new AppError('TENANCY_NOT_ACTIVE', 'You do not have an active stay.');
  }

  return {
    tenancyId: tenancy.id,
    propertyId: tenancy.propertyId,
    timezone: tenancy.property.timezone,
    settings: tenancy.property.settings,
  };
}
