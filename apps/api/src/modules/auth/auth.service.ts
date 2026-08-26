import type { Role } from '@heaven/contracts';
import type { MembershipRole, User } from '@prisma/client';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, performDummyVerification, verifyPassword } from './password.js';
import {
  ACCESS_TOKEN_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  newSessionFamilyId,
  refreshTokenExpiry,
  signAccessToken,
} from './tokens.js';

export interface AuthenticatedUserView {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly mustChangePassword: boolean;
  readonly memberships: ReadonlyArray<{
    readonly propertyId: string;
    readonly propertySlug: string;
    readonly propertyName: string;
    readonly role: Role;
  }>;
  /** Convenience for the clients: the highest-privilege role held anywhere. */
  readonly primaryRole: Role;
}

export interface AuthResult {
  readonly user: AuthenticatedUserView;
  readonly accessToken: string;
  readonly accessTokenExpiresInSeconds: number;
  readonly refreshToken: string;
}

/** Most privileged first — used to pick a landing experience. */
const ROLE_PRECEDENCE: readonly MembershipRole[] = ['OWNER', 'RESIDENT'];

type UserWithMemberships = User & {
  memberships: Array<{
    propertyId: string;
    role: MembershipRole;
    property: { slug: string; name: string };
  }>;
};

function toUserView(user: UserWithMemberships): AuthenticatedUserView {
  const memberships = user.memberships.map((membership) => ({
    propertyId: membership.propertyId,
    propertySlug: membership.property.slug,
    propertyName: membership.property.name,
    // Prisma's MembershipRole and the contract's Role are the same closed set,
    // so no cast is needed — and a cast would hide them drifting apart.
    role: membership.role,
  }));

  const primaryRole =
    ROLE_PRECEDENCE.find((role) => memberships.some((m) => m.role === role)) ?? 'RESIDENT';

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    mustChangePassword: user.mustChangePassword,
    memberships,
    primaryRole,
  };
}

const MEMBERSHIP_INCLUDE = {
  memberships: {
    include: { property: { select: { slug: true, name: true } } },
  },
} as const;

/**
 * Login and "wrong password" are reported identically, and both branches perform
 * the same Argon2 work — otherwise response timing alone reveals which phone
 * numbers and emails are registered.
 */
const GENERIC_CREDENTIAL_ERROR = () =>
  new AppError('INVALID_CREDENTIALS', 'Incorrect credentials. Please try again.');

async function registerFailedAttempt(user: User): Promise<void> {
  const attempts = user.failedLoginAttempts + 1;
  const shouldLock = attempts >= env.ACCOUNT_LOCKOUT_THRESHOLD;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: attempts,
      lastFailedLoginAt: new Date(),
      ...(shouldLock
        ? { lockedUntil: new Date(Date.now() + env.ACCOUNT_LOCKOUT_MINUTES * 60_000) }
        : {}),
    },
  });

  if (shouldLock) {
    logger.warn({ userId: user.id, attempts }, 'Account locked after repeated failed logins');
  }
}

async function issueSession(
  user: UserWithMemberships,
  familyId: string,
  context: { deviceLabel?: string | undefined; ipAddress?: string | undefined },
): Promise<AuthResult> {
  const refreshToken = generateRefreshToken();

  const session = await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      deviceLabel: context.deviceLabel ?? null,
      ipAddress: context.ipAddress ?? null,
      expiresAt: refreshTokenExpiry(),
    },
  });

  const view = toUserView(user);
  const accessToken = await signAccessToken(
    user.id,
    session.id,
    view.memberships.map((m) => ({ propertyId: m.propertyId, role: m.role })),
  );

  return {
    user: view,
    accessToken,
    accessTokenExpiresInSeconds: ACCESS_TOKEN_SECONDS,
    refreshToken,
  };
}

/**
 * Public sign-up.
 *
 * Anyone can create an account, and every new account is a RESIDENT — the role
 * is decided by the server, never sent by the client. There is deliberately no
 * way to sign up as an owner: the owner account is provisioned by the seed, and
 * a self-service route to it would be a privilege-escalation hole.
 *
 * A new account has no Tenancy, so it can sign in but sees "no active stay"
 * until the owner allocates a room. That is the correct order: a person exists
 * before their stay does.
 */
export async function register(params: {
  fullName: string;
  email: string;
  password: string;
  phone?: string | undefined;
  deviceLabel?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<AuthResult> {
  const email = params.email.trim().toLowerCase();

  // Single-property build: new residents join the property that exists. When
  // there are several this becomes an explicit choice or an invite code.
  const property = await prisma.property.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (property === null) {
    throw new AppError('INTERNAL_ERROR', 'No property is configured yet.');
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: MEMBERSHIP_INCLUDE,
  });

  if (existing !== null && existing.passwordHash !== null) {
    throw new AppError(
      'ALREADY_EXISTS',
      'An account with this email already exists. Try signing in instead.',
    );
  }

  const passwordHash = await hashPassword(params.password);

  const user = await prisma.$transaction(async (tx) => {
    // The owner may have added this person already, in which case the account
    // exists with no password. Signing up CLAIMS that account rather than
    // creating a second one — otherwise their room and invoices would be
    // stranded on the original.
    const record =
      existing === null
        ? await tx.user.create({
            data: {
              fullName: params.fullName.trim(),
              email,
              phone: params.phone?.trim() ?? null,
              passwordHash,
              status: 'ACTIVE',
            },
          })
        : await tx.user.update({
            where: { id: existing.id },
            data: {
              passwordHash,
              mustChangePassword: false,
              status: 'ACTIVE',
              fullName: params.fullName.trim(),
              ...(params.phone === undefined ? {} : { phone: params.phone.trim() }),
            },
          });

    await tx.propertyMembership.upsert({
      where: { userId_propertyId: { userId: record.id, propertyId: property.id } },
      // An existing membership is left alone: claiming an account must not
      // downgrade an owner to a resident.
      update: {},
      create: { userId: record.id, propertyId: property.id, role: 'RESIDENT' },
    });

    return tx.user.findUniqueOrThrow({ where: { id: record.id }, include: MEMBERSHIP_INCLUDE });
  });

  logger.info({ userId: user.id, claimed: existing !== null }, 'Account registered');

  return issueSession(user, newSessionFamilyId(), {
    deviceLabel: params.deviceLabel,
    ipAddress: params.ipAddress,
  });
}

export async function login(params: {
  identifier: string;
  password: string;
  deviceLabel?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<AuthResult> {
  const identifier = params.identifier.trim();

  // A single lookup on either identity column; the client does not have to say
  // which kind of identifier it is sending.
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }] },
    include: MEMBERSHIP_INCLUDE,
  });

  if (user === null) {
    await performDummyVerification(params.password);
    throw GENERIC_CREDENTIAL_ERROR();
  }

  // Lockout is checked before the password: a locked account must not become an
  // oracle for whether a guess was correct.
  if (user.lockedUntil !== null && user.lockedUntil > new Date()) {
    throw new AppError(
      'ACCOUNT_LOCKED',
      'Too many failed attempts. Please try again later or contact the manager.',
    );
  }

  if (user.status !== 'ACTIVE' || user.passwordHash === null) {
    await performDummyVerification(params.password);
    throw new AppError(
      'ACCOUNT_INACTIVE',
      'This account is not active. Please contact the manager.',
    );
  }

  const passwordMatches = await verifyPassword(user.passwordHash, params.password);
  if (!passwordMatches) {
    await registerFailedAttempt(user);
    throw GENERIC_CREDENTIAL_ERROR();
  }

  // The counter resets only on a SUCCESSFUL login, so an attacker cannot reset it
  // by interleaving guesses with anything else.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  logger.info({ userId: user.id }, 'Login succeeded');

  return issueSession(user, newSessionFamilyId(), {
    deviceLabel: params.deviceLabel,
    ipAddress: params.ipAddress,
  });
}

/**
 * Rotates a refresh token.
 *
 * Presenting an already-revoked token means it was replayed. That is the
 * signature of a stolen token, so the entire family is revoked — logging out that
 * device chain rather than letting an attacker ride along beside the real user.
 */
export async function refresh(params: {
  refreshToken: string;
  ipAddress?: string | undefined;
}): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(params.refreshToken);

  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    include: { user: { include: MEMBERSHIP_INCLUDE } },
  });

  if (session === null) {
    throw new AppError('SESSION_REVOKED', 'Your session has expired. Please sign in again.');
  }

  if (session.revokedAt !== null) {
    await prisma.refreshSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.warn(
      { userId: session.userId, familyId: session.familyId },
      'Refresh token reuse detected; revoked the entire session family',
    );
    throw new AppError('SESSION_REVOKED', 'Your session has expired. Please sign in again.');
  }

  if (session.expiresAt <= new Date()) {
    throw new AppError('SESSION_REVOKED', 'Your session has expired. Please sign in again.');
  }

  if (session.user.status !== 'ACTIVE') {
    throw new AppError('ACCOUNT_INACTIVE', 'This account is not active.');
  }

  const result = await issueSession(session.user, session.familyId, {
    ipAddress: params.ipAddress,
    deviceLabel: session.deviceLabel ?? undefined,
  });

  // Revoke the old token only after the replacement exists, so a failure here
  // cannot strand the user with neither token.
  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return result;
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  // updateMany, not update: logging out twice must not throw.
  await prisma.refreshSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every session for a user — used on password change and by staff. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserView(userId: string): Promise<AuthenticatedUserView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: MEMBERSHIP_INCLUDE,
  });

  if (user === null || user.status !== 'ACTIVE') {
    throw new AppError('UNAUTHENTICATED', 'Please sign in again.');
  }

  return toUserView(user);
}

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (user === null || user.passwordHash === null) {
    throw new AppError('UNAUTHENTICATED', 'Please sign in again.');
  }

  if (!(await verifyPassword(user.passwordHash, params.currentPassword))) {
    throw new AppError('INVALID_CREDENTIALS', 'Your current password is incorrect.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(params.newPassword), mustChangePassword: false },
  });

  // Every other device is signed out: a password change is how a user responds to
  // a suspected compromise, so leaving old sessions alive would defeat it.
  await revokeAllSessions(user.id);
}
