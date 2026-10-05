import { notify } from '../notifications/notification.service.js';
import { DEFAULT_SIGNUP_ROLE, maskIndianPhone, type Role } from '@heaven/contracts';
import type { User, UserRole } from '@prisma/client';

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
  readonly phone: string;
  readonly email: string | null;
  /** The authorisation role. Single source of truth: the `role` column. */
  readonly role: Role;
  readonly mustChangePassword: boolean;
  /** Null until the admission form is submitted — checked before any tenancy exists. */
  readonly registrationCompletedAt: string | null;
  readonly memberships: ReadonlyArray<{
    readonly propertyId: string;
    readonly propertySlug: string;
    readonly propertyName: string;
    readonly role: Role;
  }>;
}

export interface AuthResult {
  readonly user: AuthenticatedUserView;
  readonly accessToken: string;
  readonly accessTokenExpiresInSeconds: number;
  readonly refreshToken: string;
}

type UserWithMemberships = User & {
  memberships: Array<{
    propertyId: string;
    role: UserRole;
    property: { slug: string; name: string };
  }>;
};

const MEMBERSHIP_INCLUDE = {
  memberships: {
    include: { property: { select: { slug: true, name: true } } },
  },
} as const;

function toUserView(user: UserWithMemberships): AuthenticatedUserView {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    registrationCompletedAt: user.registrationCompletedAt?.toISOString() ?? null,
    memberships: user.memberships.map((membership) => ({
      propertyId: membership.propertyId,
      propertySlug: membership.property.slug,
      propertyName: membership.property.name,
      role: membership.role,
    })),
  };
}

/**
 * "No such number" and "wrong password" are reported identically, and both
 * branches perform the same Argon2 work — otherwise response timing alone
 * reveals which numbers are registered.
 */
const GENERIC_CREDENTIAL_ERROR = () =>
  new AppError('INVALID_CREDENTIALS', 'Incorrect mobile number or password.');

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
  const accessToken = await signAccessToken(user.id, session.id, view.role, {
    memberships: view.memberships.map((m) => ({ propertyId: m.propertyId, role: m.role })),
    passwordChangeRequired: view.mustChangePassword,
  });

  return {
    user: view,
    accessToken,
    accessTokenExpiresInSeconds: ACCESS_TOKEN_SECONDS,
    refreshToken,
  };
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

/**
 * Creates an account from a phone number, a name and a password.
 *
 * The role is decided here, by the server, and is always NON_RESIDENT. There is
 * no parameter for it, so no client can ask to be an ADMIN or a RESIDENT — those
 * are granted by an admin action.
 *
 * A number that already has an account is refused, including one the owner added
 * with a temporary password: that person signs in with it instead, so a number
 * alone can never be used to take over their account.
 */
export async function signup(params: {
  phone: string;
  fullName: string;
  password: string;
  deviceLabel?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { phone: params.phone },
    select: { mustChangePassword: true },
  });

  if (existing !== null) {
    throw new AppError(
      'ALREADY_EXISTS',
      existing.mustChangePassword
        ? 'This number was added by your manager. Sign in with the temporary password you were given.'
        : 'This mobile number already has an account. Please sign in instead.',
    );
  }

  const user = await prisma.user.create({
    data: {
      phone: params.phone,
      fullName: params.fullName.trim(),
      passwordHash: await hashPassword(params.password),
      role: DEFAULT_SIGNUP_ROLE,
      status: 'ACTIVE',
    },
    include: MEMBERSHIP_INCLUDE,
  });

  logger.info(
    { userId: user.id, role: user.role, phone: maskIndianPhone(user.phone) },
    'Account created',
  );

  return issueSession(user, newSessionFamilyId(), {
    deviceLabel: params.deviceLabel,
    ipAddress: params.ipAddress,
  });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(params: {
  phone: string;
  password: string;
  deviceLabel?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { phone: params.phone },
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

  if (!(await verifyPassword(user.passwordHash, params.password))) {
    await registerFailedAttempt(user);
    throw GENERIC_CREDENTIAL_ERROR();
  }

  // Checked after the password so an expired temporary password is only reported
  // to someone who actually knows it.
  if (
    user.mustChangePassword &&
    user.tempPasswordExpiresAt !== null &&
    user.tempPasswordExpiresAt <= new Date()
  ) {
    throw new AppError(
      'TEMP_PASSWORD_EXPIRED',
      'This temporary password has expired. Please ask your manager for a new one.',
    );
  }

  // The counter resets only on a SUCCESSFUL login, so an attacker cannot reset
  // it by interleaving guesses with anything else.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  logger.info({ userId: user.id, role: user.role }, 'Login succeeded');

  return issueSession(user, newSessionFamilyId(), {
    deviceLabel: params.deviceLabel,
    ipAddress: params.ipAddress,
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Rotates a refresh token.
 *
 * Presenting an already-revoked token means it was replayed. That is the
 * signature of a stolen token, so the entire family is revoked — logging out
 * that device chain rather than letting an attacker ride along beside the real
 * user.
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

/** Revokes every session for a user — used on password change. */
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
    data: {
      passwordHash: await hashPassword(params.newPassword),
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
    },
  });

  // Every other device is signed out: a password change is how a user responds
  // to a suspected compromise, so leaving old sessions alive would defeat it.
  await revokeAllSessions(user.id);

  await notify({
    event: 'PASSWORD_CHANGED',
    userId: user.id,
    dedupeKey: String(Date.now()),
    params: {},
  });
}
