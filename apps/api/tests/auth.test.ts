import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../src/modules/auth/tokens.js';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
  });

  it('never stores the password in the hash', async () => {
    const hash = await hashPassword('SuperSecret123');
    expect(hash).not.toContain('SuperSecret123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('salts each hash, so identical passwords do not collide', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(first).not.toBe(second);
    // Both still verify — the salt is embedded in the encoded hash.
    expect(await verifyPassword(first, 'same')).toBe(true);
    expect(await verifyPassword(second, 'same')).toBe(true);
  });

  it('returns false for a corrupt hash rather than throwing', async () => {
    // A corrupt row must fail the login, not crash the request and thereby
    // confirm that the account exists.
    expect(await verifyPassword('not-a-valid-hash', 'anything')).toBe(false);
  });
});

describe('access tokens', () => {
  const roles = [{ propertyId: 'prop-1', role: 'OWNER' as const }];

  it('round-trips subject, session and roles', async () => {
    const token = await signAccessToken('user-1', 'session-1', roles);
    const claims = await verifyAccessToken(token);

    expect(claims.sub).toBe('user-1');
    expect(claims.sid).toBe('session-1');
    expect(claims.roles).toEqual(roles);
  });

  it('carries no permission list', async () => {
    // Permissions are resolved server-side per request, so revoking one takes
    // effect immediately instead of waiting for the token to expire.
    const token = await signAccessToken('user-1', 'session-1', roles);
    const claims = await verifyAccessToken(token);
    expect(claims).not.toHaveProperty('permissions');
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken('user-1', 'session-1', roles);
    const [header, payload, signature] = token.split('.');

    // Re-encode the payload with an escalated role, keeping the original
    // signature — the classic privilege-escalation attempt.
    const forged = Buffer.from(
      JSON.stringify({
        sub: 'user-1',
        sid: 'session-1',
        roles: [{ propertyId: 'prop-1', role: 'OWNER' }],
      }),
    ).toString('base64url');

    await expect(verifyAccessToken(`${header}.${forged}.${signature}`)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(payload).not.toBe(forged);
  });

  it('rejects a token signed with the wrong secret', async () => {
    // A well-formed JWT from another issuer must not be accepted.
    const foreign =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciIsInNpZCI6IngiLCJyb2xlcyI6W119.' +
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await expect(verifyAccessToken(foreign)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a malformed token with TOKEN_INVALID, not a crash', async () => {
    const error = await verifyAccessToken('not.a.token').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('TOKEN_INVALID');
  });
});

describe('refresh tokens', () => {
  it('generates high-entropy, unique tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(200);
    // 48 random bytes, base64url encoded.
    expect([...tokens][0]?.length).toBeGreaterThanOrEqual(64);
  });

  it('hashes deterministically so lookup works, and irreversibly so a leak does not', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);

    expect(hashRefreshToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(
      hashRefreshToken(generateRefreshToken()),
    );
  });
});
