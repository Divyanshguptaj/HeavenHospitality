import type { FacilityView, PropertyPhotoView, RuleView } from '@heaven/contracts';
import { Prisma } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import type { Loose } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getPropertyContext } from './property.context.js';

/**
 * The public-facing content an owner maintains: facilities, house rules and
 * gallery photos. Each is a simple name/description-shaped row with isActive
 * (unpublish without losing the content) and, for facilities and rules,
 * sortOrder (the order guests see them in) — read by public.ts, written here.
 */

// --- Facilities ---------------------------------------------------------------

function toFacilityView(facility: {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  isActive: boolean;
  sortOrder: number;
}): FacilityView {
  return {
    id: facility.id,
    name: facility.name,
    description: facility.description,
    iconKey: facility.iconKey as FacilityView['iconKey'],
    isActive: facility.isActive,
    sortOrder: facility.sortOrder,
  };
}

export async function listFacilities(actor: Actor): Promise<FacilityView[]> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');
  const facilities = await prisma.facility.findMany({
    where: { propertyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return facilities.map(toFacilityView);
}

export async function createFacility(
  actor: Actor,
  input: {
    name: string;
    description?: string | undefined;
    iconKey?: string | undefined;
    isActive?: boolean | undefined;
    sortOrder?: number | undefined;
  },
): Promise<FacilityView> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  try {
    const facility = await prisma.facility.create({
      data: {
        propertyId,
        name: input.name,
        description: input.description ?? null,
        iconKey: input.iconKey ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return toFacilityView(facility);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('ALREADY_EXISTS', 'A facility with that name already exists.');
    }
    throw error;
  }
}

export async function updateFacility(
  actor: Actor,
  id: string,
  input: Loose<{
    name: string;
    description: string | null;
    iconKey: string | null;
    isActive: boolean;
    sortOrder: number;
  }>,
): Promise<FacilityView> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const updated = await prisma.facility.updateMany({ where: { id, propertyId }, data });
  if (updated.count === 0) throw new AppError('NOT_FOUND', 'Facility not found.');
  const facility = await prisma.facility.findUniqueOrThrow({ where: { id } });
  return toFacilityView(facility);
}

export async function deleteFacility(actor: Actor, id: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const deleted = await prisma.facility.deleteMany({ where: { id, propertyId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Facility not found.');
}

// --- House rules ----------------------------------------------------------------

function toRuleView(rule: {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}): RuleView {
  return {
    id: rule.id,
    title: rule.title,
    description: rule.description,
    isActive: rule.isActive,
    sortOrder: rule.sortOrder,
  };
}

export async function listRules(actor: Actor): Promise<RuleView[]> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');
  const rules = await prisma.propertyRule.findMany({
    where: { propertyId },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });
  return rules.map(toRuleView);
}

export async function createRule(
  actor: Actor,
  input: {
    title: string;
    description: string;
    isActive?: boolean | undefined;
    sortOrder?: number | undefined;
  },
): Promise<RuleView> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const rule = await prisma.propertyRule.create({
    data: {
      propertyId,
      title: input.title,
      description: input.description,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  return toRuleView(rule);
}

export async function updateRule(
  actor: Actor,
  id: string,
  input: Loose<{ title: string; description: string; isActive: boolean; sortOrder: number }>,
): Promise<RuleView> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const updated = await prisma.propertyRule.updateMany({ where: { id, propertyId }, data });
  if (updated.count === 0) throw new AppError('NOT_FOUND', 'Rule not found.');
  const rule = await prisma.propertyRule.findUniqueOrThrow({ where: { id } });
  return toRuleView(rule);
}

export async function deleteRule(actor: Actor, id: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const deleted = await prisma.propertyRule.deleteMany({ where: { id, propertyId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Rule not found.');
}

// --- Gallery ----------------------------------------------------------------

function toPhotoView(photo: {
  id: string;
  url: string;
  caption: string | null;
  isActive: boolean;
}): PropertyPhotoView {
  return { id: photo.id, url: photo.url, caption: photo.caption, isActive: photo.isActive };
}

export async function listPhotos(actor: Actor): Promise<PropertyPhotoView[]> {
  const { propertyId } = await getPropertyContext(actor, 'property:read');
  const photos = await prisma.propertyPhoto.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
  });
  return photos.map(toPhotoView);
}

export async function createPhoto(
  actor: Actor,
  input: { url: string; caption?: string | undefined; isActive?: boolean | undefined },
): Promise<PropertyPhotoView> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const photo = await prisma.propertyPhoto.create({
    data: {
      propertyId,
      url: input.url,
      caption: input.caption ?? null,
      isActive: input.isActive ?? true,
    },
  });
  return toPhotoView(photo);
}

export async function updatePhoto(
  actor: Actor,
  id: string,
  input: Loose<{ url: string; caption: string | null; isActive: boolean }>,
): Promise<PropertyPhotoView> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const updated = await prisma.propertyPhoto.updateMany({ where: { id, propertyId }, data });
  if (updated.count === 0) throw new AppError('NOT_FOUND', 'Photo not found.');
  const photo = await prisma.propertyPhoto.findUniqueOrThrow({ where: { id } });
  return toPhotoView(photo);
}

export async function deletePhoto(actor: Actor, id: string): Promise<void> {
  const { propertyId } = await getPropertyContext(actor, 'property:write');
  const deleted = await prisma.propertyPhoto.deleteMany({ where: { id, propertyId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Photo not found.');
}

// ---------------------------------------------------------------------------

const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION
  );
}
