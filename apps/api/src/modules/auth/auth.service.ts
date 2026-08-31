import { DEFAULT_SIGNUP_ROLE, maskIndianPhone, type Role } from '@heaven/contracts';
import type { User, UserRole } from '@prisma/client';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  consumeVerificationToken,
  requestOtp,
  verifyOtp,
  type OtpRequestResult,
  type OtpVerifyResult,
} from './otp.service.js';
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
  readonly phoneVerified: boolean;
  readonly mustChangePassword: boolean;
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
    phoneVerified: user.phoneVerifiedAt !== null,
    mustChangePassword: user.mustChangePassword,
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
  });

  return {
    user: view,
    accessToken,
    accessTokenExpiresInSeconds: ACCESS_TOKEN_SECONDS,
    refreshToken,
  };
}

// ---------------------------------------------------------------------------
// Signup — three steps, and no account exists until the third.
//
// The ordering is the security property: a phone number is proven before an
// account is attached to it, so nobody can create an account on someone else's
// number and nobody can hold a password against an unverified one.
// ---------------------------------------------------------------------------

/** Step 1: prove you can receive SMS at this number. */
export async function startSignup(phone: string): Promise<OtpRequestResult> {
  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { passwordHash: true },
  });

  // Signing up on a number that already has a usable account is a dead end, so
  // say so rather than sending a code that could never complete. This does
  // confirm the number is registered — unavoidable for any usable signup form,
  // and the reason password reset (below) deliberately does NOT confirm it.
  if (existing !== null && existing.passwordHash !== null) {
    throw new AppError(
      'ALREADY_EXISTS',
      'This mobile number already has an account. Please sign in instead.',
    );
  }

  return requestOtp({ phone, purpose: 'SIGNUP' });
}

/** Step 2: exchange the code for a short-lived proof of verification. */
export async function verifySignupOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  return verifyOtp({ phone, code, purpose: 'SIGNUP' });
}

/**
 * Step 3: choose a password, and the account comes into being.
 *
 * The role is decided here, by the server, and is always NON_RESIDENT. There is
 * no parameter for it and no request field that reaches it, so no client can ask
 * to be an ADMIN or a RESIDENT — those are granted by an admin action, never
 * claimed. A returning tenant is recognised by their phone number and keeps the
 * role they already had (see the account-claiming branch below).
 *
 * NON_RESIDENT is a zero-permission role: signing up buys a profile and nothing
 * else, because everything a non-resident can see is already public.
 */
export async function completeSignup(params: {
  phone: string;
  verificationToken: string;
  fullName: string;
  password: string;
  deviceLabel?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<AuthResult> {
  await consumeVerificationToken({
    phone: params.phone,
    token: params.verificationToken,
    purpose: 'SIGNUP',
  });

  const passwordHash = await hashPassword(params.password);
  const existing = await prisma.user.findUnique({ where: { phone: params.phone } });

  // Re-checked after verification, not only at step 1: the window between the
  // two is minutes long, and two people racing the same number must not both win.
  if (existing !== null && existing.passwordHash !== null) {
    throw new AppError(
      'ALREADY_EXISTS',
      'This mobile number already has an account. Please sign in instead.',
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    // The owner may have added this person already, in which case the account
    // exists with no password. Signing up CLAIMS that account rather than
    // creating a second one — otherwise their room and invoices would be
    // stranded on the original. Their existing role is left untouched.
    const record =
      existing === null
        ? await tx.user.create({
            data: {
              phone: params.phone,
              fullName: params.fullName.trim(),
              passwordHash,
              role: DEFAULT_SIGNUP_ROLE,
              phoneVerifiedAt: new Date(),
              status: 'ACTIVE',
            },
          })
        : await tx.user.update({
            where: { id: existing.id },
            data: {
              passwordHash,
              fullName: params.fullName.trim(),
              phoneVerifiedAt: new Date(),
              mustChangePassword: false,
              status: 'ACTIVE',
              // `role` is deliberately absent. The admin may have provisioned
              // this person as a RESIDENT already; claiming the account must not
              // demote them, and it must not promote anyone either.
            },
          });

    // No membership is created here. A membership records where an account holds
    // AUTHORITY, and a non-resident holds none anywhere — writing an empty one
    // would be a row that means nothing and a claim the token would carry.
    // The admin creates it when they accept this person as a tenant.

    return tx.user.findUniqueOrThrow({ where: { id: record.id }, include: MEMBERSHIP_INCLUDE });
  });

  logger.info(
    { userId: user.id, role: user.role, claimed: existing !== null, phone: maskIndianPhone(user.phone) },
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

  // An unverified number cannot hold a session. Signup always sets this, so in
  // practice only an owner-provisioned account can be in this state.
  if (user.phoneVerifiedAt === null) {
    await performDummyVerification(params.password);
    throw new AppError(
      'PHONE_NOT_VERIFIED',
      'This mobile number has not been verified. Please sign up to finish setting up your account.',
    );
  }

  if (!(await verifyPassword(user.passwordHash, params.password))) {
    await registerFailedAttempt(user);
    throw GENERIC_CREDENTIAL_ERROR();
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
// Forgot password
// ---------------------------------------------------------------------------

/**
 * Step 1 of reset. Responds identically whether or not the number is registered.
 *
 * Unlike signup, this flow has no legitimate reason to confirm existence: a
 * person resetting their own password already knows they have an account. So an
 * unregistered number gets the same "code sent" response, and no SMS. Otherwise
 * this endpoint would be a free membership-list lookup.
 */
export async function startPasswordReset(phone: string): Promise<OtpRequestResult> {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, status: true, passwordHash: true },
  });

  const eligible = user !== null && user.status === 'ACTIVE' && user.passwordHash !== null;

  if (!eligible) {
    logger.info(
      { phone: maskIndianPhone(phone) },
      'Password reset requested for an unknown or ineligible number; responding as if sent',
    );

    return {
      phone,
      maskedPhone: maskIndianPhone(phone),
      expiresInSeconds: env.OTP_TTL_MINUTES * 60,
      resendAvailableInSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  return requestOtp({ phone, purpose: 'PASSWORD_RESET' });
}

export async function verifyPasswordResetOtp(
  phone: string,
  code: string,
): Promise<OtpVerifyResult> {
  return verifyOtp({ phone, code, purpose: 'PASSWORD_RESET' });
}

/**
 * Step 3 of reset. Requires the verification token, so knowing a phone number is
 * never enough on its own.
 */
export async function resetPassword(params: {
  phone: string;
  verificationToken: string;
  password: string;
}): Promise<void> {
  await consumeVerificationToken({
    phone: params.phone,
    token: params.verificationToken,
    purpose: 'PASSWORD_RESET',
  });

  const user = await prisma.user.findUnique({ where: { phone: params.phone } });
  if (user === null) {
    throw new AppError('NOT_FOUND', 'No account was found for this number.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(params.password),
      mustChangePassword: false,
      // A reset is also how someone recovers a locked account.
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  // Every existing session dies. A reset is how a user responds to a suspected
  // compromise, so leaving the attacker's session alive would defeat the point.
  await revokeAllSessions(user.id);

  logger.info({ userId: user.id }, 'Password reset; all sessions revoked');
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

/** Revokes every session for a user — used on password change and reset. */
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

  // Every other device is signed out: a password change is how a user responds
  // to a suspected compromise, so leaving old sessions alive would defeat it.
  await revokeAllSessions(user.id);
}
