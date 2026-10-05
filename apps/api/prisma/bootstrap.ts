/**
 * Production bootstrap: creates the property and its owner, nothing else.
 *
 *   BOOTSTRAP_OWNER_PHONE=+91... BOOTSTRAP_OWNER_PASSWORD=... pnpm db:bootstrap
 */
import { PrismaClient, UserRole } from '@prisma/client';

import { hashPassword } from '../src/modules/auth/password.js';

const prisma = new PrismaClient();

const SLUG = 'heaven-hospitality-kothrud';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const phone = required('BOOTSTRAP_OWNER_PHONE');
  const passwordHash = await hashPassword(required('BOOTSTRAP_OWNER_PASSWORD'));
  const fullName = process.env['BOOTSTRAP_OWNER_NAME'] ?? 'Property Owner';

  const property = await prisma.property.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      slug: SLUG,
      name: 'Heaven Hospitality',
      addressLine: 'Kothrud',
      locality: 'Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      contactPhone: phone,
      highlights: [],
      settings: { create: {} },
    },
  });

  const owner = await prisma.user.upsert({
    where: { phone },
    update: { fullName, passwordHash, role: UserRole.ADMIN, status: 'ACTIVE' },
    create: {
      fullName,
      phone,
      passwordHash,
      role: UserRole.ADMIN,
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });

  await prisma.propertyMembership.upsert({
    where: { userId_propertyId: { userId: owner.id, propertyId: property.id } },
    update: { role: UserRole.ADMIN },
    create: { userId: owner.id, propertyId: property.id, role: UserRole.ADMIN },
  });

  process.stdout.write(`Owner ${phone} ready for property ${property.slug}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
