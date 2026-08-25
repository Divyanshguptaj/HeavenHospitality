import type { SettingsView, UpdateSettingsInput } from '@heaven/contracts';
import type { Prisma } from '@prisma/client';

import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';
import { getPropertyContext } from '../property/property.context.js';

/**
 * Owner settings.
 *
 * Every value here is read at calculation time by the code that needs it —
 * nothing financial is hard-coded (spec §10, §25). Changing a rate affects
 * FUTURE calculations only: rates are snapshot onto readings and invoices when
 * they are generated, so history is never rewritten.
 */

const PROPERTY_FIELDS = [
  'name',
  'tagline',
  'description',
  'addressLine',
  'locality',
  'city',
  'state',
  'pincode',
  'contactPhone',
  'contactEmail',
  'isPubliclyListed',
] as const;

export type PropertyProfileInput = Partial<Record<(typeof PROPERTY_FIELDS)[number], unknown>>;

export async function getSettings(actor: Actor): Promise<SettingsView> {
  const { propertyId } = await getPropertyContext(actor, 'settings:read');

  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: { settings: true, mealTimings: { orderBy: { mealType: 'asc' } } },
  });

  if (property.settings === null) {
    throw new AppError('INTERNAL_ERROR', 'Property settings are missing.');
  }

  const s = property.settings;

  return {
    property: {
      id: property.id,
      slug: property.slug,
      name: property.name,
      tagline: property.tagline,
      description: property.description,
      addressLine: property.addressLine,
      locality: property.locality,
      city: property.city,
      state: property.state,
      pincode: property.pincode,
      contactPhone: property.contactPhone,
      contactEmail: property.contactEmail,
      isPubliclyListed: property.isPubliclyListed,
      timezone: property.timezone,
    },
    financial: {
      rentDueDay: s.rentDueDay,
      graceDays: s.graceDays,
      lateFeePerDayPaise: s.lateFeePerDayPaise,
      lateFeeCapPaise: s.lateFeeCapPaise,
      electricityRatePaisePerUnit: s.electricityRatePaisePerUnit,
    },
    payment: {
      bankAccountName: s.bankAccountName,
      bankAccountNumber: s.bankAccountNumber,
      bankIfsc: s.bankIfsc,
      bankName: s.bankName,
      upiId: s.upiId,
      upiQrImageUrl: s.upiQrImageUrl,
      paymentDetailsArePublic: s.paymentDetailsArePublic,
    },
    mess: {
      mealCutoffLocalTime: s.mealCutoffLocalTime,
      timings: property.mealTimings.map((timing) => ({
        mealType: timing.mealType,
        startsAt: timing.startsAt,
        endsAt: timing.endsAt,
      })),
    },
  };
}

/**
 * Updates settings and records what changed.
 *
 * The audit entry carries only the FIELDS THAT CHANGED, not the whole row — an
 * unrestricted diff would copy bank account numbers into the audit log on every
 * unrelated edit. See docs/0008-data-protection.md.
 */
export async function updateSettings(
  actor: Actor,
  input: UpdateSettingsInput,
): Promise<SettingsView> {
  const { propertyId, settings } = await getPropertyContext(actor, 'settings:write');

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const current = settings as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && current[key] !== value) {
      // Never record the value of a secret-ish field, only that it changed.
      const isSensitive = key === 'bankAccountNumber' || key === 'upiId';
      changed[key] = isSensitive
        ? { from: '[redacted]', to: '[redacted]' }
        : { from: current[key], to: value };
    }
  }

  if (Object.keys(changed).length === 0) {
    return getSettings(actor);
  }

  // exactOptionalPropertyTypes distinguishes "absent" from "present but
  // undefined"; Prisma wants the former, so undefined keys are dropped.
  const data = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Prisma.PropertySettingsUpdateInput;

  await prisma.$transaction(async (tx) => {
    await tx.propertySettings.update({ where: { propertyId }, data });

    await writeAudit(tx, {
      action: 'SETTINGS_CHANGED',
      entityType: 'PropertySettings',
      entityId: propertyId,
      propertyId,
      summary: `Settings updated: ${Object.keys(changed).join(', ')}`,
      actorUserId: actor.userId,
      actorRole: 'OWNER',
      after: changed as Prisma.InputJsonValue,
    });
  });

  return getSettings(actor);
}

/** Public-facing property profile (spec §18 — none of this is hard-coded in the UI). */
export async function updatePropertyProfile(
  actor: Actor,
  input: PropertyProfileInput,
): Promise<SettingsView> {
  const { propertyId } = await getPropertyContext(actor, 'settings:write');

  const data: Record<string, unknown> = {};
  for (const field of PROPERTY_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field];
  }

  if (Object.keys(data).length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.property.update({ where: { id: propertyId }, data });
      await writeAudit(tx, {
        action: 'SETTINGS_CHANGED',
        entityType: 'Property',
        entityId: propertyId,
        propertyId,
        summary: `Property details updated: ${Object.keys(data).join(', ')}`,
        actorUserId: actor.userId,
        actorRole: 'OWNER',
      });
    });
  }

  return getSettings(actor);
}
