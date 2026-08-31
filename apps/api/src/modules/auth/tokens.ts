import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Role } from '@heaven/contracts';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';

const ISSUER = 'heaven-hospitality';
const AUDIENCE = 'heaven-clients';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/**
 * What an access token asserts.
 *
 * Deliberately minimal: subject, session and the roles the user holds per
 * property. It carries NO permission list — permissions are resolved server-side
 * from the role matrix on every request, so revoking a permission takes effect
 * immediately instead of waiting for a token to expire.
 */
export interface AccessTokenClaims extends JWTPayload {
  readonly sub: string;
  readonly sid: string;
  /** The account's authorisation role — what `requireRole` reads. */
  readonly role: Role;
  /** Where the account holds authority, for property-scoped checks. */
  readonly roles: ReadonlyArray<{ readonly propertyId: string; readonly role: Role }>;
}

function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (match === null) throw new Error(`Invalid duration: ${duration}`);

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };
  const multiplier = multipliers[unit ?? 's'];
  if (multiplier === undefined) throw new Error(`Invalid duration unit: ${String(unit)}`);

  return amount * multiplier;
}

export const ACCESS_TOKEN_SECONDS = durationToSeconds(env.ACCESS_TOKEN_TTL);
export const REFRESH_TOKEN_SECONDS = durationToSeconds(env.REFRESH_TOKEN_TTL);

export async function signAccessToken(
  userId: string,
  sessionId: string,
  role: Role,
  scope: { memberships: AccessTokenClaims['roles'] },
): Promise<string> {
  return new SignJWT({ sid: sessionId, role, roles: scope.memberships })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    return payload as AccessTokenClaims;
  } catch (error) {
    // Distinguish expiry (the client should refresh) from anything else (the
    // client should sign in again). Every other failure is reported identically
    // so a forged token learns nothing from the response.
    const code =
      error instanceof Error && error.name === 'JWTExpired' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    throw new AppError(code, 'Your session is no longer valid. Please sign in again.');
  }
}

/**
 * Refresh tokens are opaque random strings, not JWTs.
 *
 * A JWT would be self-validating and therefore impossible to revoke before it
 * expires. An opaque token is meaningless without the database row, so revoking
 * the row revokes the token instantly.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Only the hash is stored, so a database leak does not hand over live sessions.
 * SHA-256 (not Argon2) is correct here: the token is 384 bits of entropy we
 * generated ourselves, so it is not brute-forceable and needs no key stretching —
 * and refresh happens often enough that the speed matters.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionFamilyId(): string {
  return randomUUID();
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1_000);
}
