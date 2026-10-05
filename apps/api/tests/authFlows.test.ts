import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fakePrisma,
  resetFakePrisma,
  seedProperty,
  sessionTable,
  userTable,
} from './support/fakePrisma.js';

// Must be hoisted above the imports of the modules under test, so they receive
// the fake rather than a real client. `vi.mock` is hoisted by vitest for us.
vi.mock('../src/lib/prisma.js', () => ({ prisma: fakePrisma }));

const { AppError } = await import('../src/errors/AppError.js');
const authService = await import('../src/modules/auth/auth.service.js');
const { hashPassword } = await import('../src/modules/auth/password.js');

/**
 * End-to-end authentication behaviour, exercised through the real services.
 *
 * These are the rules that decide whether someone can get into an account they
 * do not own, so each test names an attack rather than a function.
 */

const PHONE = '+919876543210';
const OTHER_PHONE = '+919876543211';
const PASSWORD = 'ValidPass123';

beforeEach(async () => {
  resetFakePrisma();
  await seedProperty();
});

/** Signs up and returns the session. */
async function signUp(phone = PHONE, password = PASSWORD) {
  return authService.signup({ phone, fullName: 'Test Person', password });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `expected ${code} but the call succeeded`).toBeInstanceOf(AppError);
  expect((error as InstanceType<typeof AppError>).code).toBe(code);
}

// ---------------------------------------------------------------------------

describe('signup', () => {
  it('creates the account straight from a phone number, name and password', async () => {
    const session = await signUp();
    expect(userTable.rows).toHaveLength(1);
    expect(session.user.fullName).toBe('Test Person');
  });

  it('creates the account and signs it in as a NON_RESIDENT', async () => {
    const session = await signUp();

    expect(session.user.phone).toBe(PHONE);
    expect(session.user.role).toBe('NON_RESIDENT');
    expect(session.accessToken).not.toBe('');
    expect(session.refreshToken).not.toBe('');
  });

  it('never lets the caller choose its own role', async () => {
    // There is no role parameter to pass; this asserts the outcome that makes
    // that true — a public signup cannot produce an admin or a resident.
    const session = await signUp();

    expect(session.user.role).toBe('NON_RESIDENT');
    expect(userTable.rows[0]?.['role']).toBe('NON_RESIDENT');
  });

  it('grants a new account no authority anywhere', async () => {
    // NON_RESIDENT holds no permissions, and signup writes no membership: a
    // fresh account carries exactly the access a signed-out guest has. The
    // token's `roles` claim being empty is what makes that true server-side.
    const session = await signUp();
    expect(session.user.memberships).toEqual([]);
  });

  it('refuses to let a stranger claim an account the owner added', async () => {
    // The owner added this resident with a temporary password. Someone who only
    // knows the phone number must not be able to sign up on it.
    await addProvisionedResident(OTHER_PHONE);

    await expectCode(signUp(OTHER_PHONE, 'AttackerPass1'), 'ALREADY_EXISTS');
    expect(userTable.rows[0]?.['role']).toBe('RESIDENT');
  });

  it('refuses a second account on a number that already has one', async () => {
    await signUp();
    await expectCode(signUp(), 'ALREADY_EXISTS');
  });
});

const TEMP_PASSWORD = 'K7M2QX9P';

/** The shape createResident leaves behind: a hashed temporary password with an expiry. */
async function addProvisionedResident(phone: string, expiresAt = new Date(Date.now() + 86_400_000)) {
  await userTable.create({
    data: {
      phone,
      fullName: 'Provisioned Tenant',
      passwordHash: await hashPassword(TEMP_PASSWORD),
      role: 'RESIDENT',
      status: 'ACTIVE',
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
    },
  });
}

describe('temporary passwords', () => {
  it('signs the resident in and flags that the password must be changed', async () => {
    await addProvisionedResident(OTHER_PHONE);

    const session = await authService.login({ phone: OTHER_PHONE, password: TEMP_PASSWORD });
    expect(session.user.mustChangePassword).toBe(true);
    expect(session.user.role).toBe('RESIDENT');
  });

  it('refuses an expired temporary password', async () => {
    await addProvisionedResident(OTHER_PHONE, new Date(Date.now() - 1_000));

    await expectCode(
      authService.login({ phone: OTHER_PHONE, password: TEMP_PASSWORD }),
      'TEMP_PASSWORD_EXPIRED',
    );
  });

  it('does not reveal the expiry to someone who has the wrong password', async () => {
    await addProvisionedResident(OTHER_PHONE, new Date(Date.now() - 1_000));

    await expectCode(
      authService.login({ phone: OTHER_PHONE, password: 'WrongGuess1' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('clears the flag and the expiry once a real password is chosen', async () => {
    await addProvisionedResident(OTHER_PHONE);
    const session = await authService.login({ phone: OTHER_PHONE, password: TEMP_PASSWORD });

    await authService.changePassword({
      userId: session.user.id,
      currentPassword: TEMP_PASSWORD,
      newPassword: 'MyOwnPass123',
    });

    expect(userTable.rows[0]?.['mustChangePassword']).toBe(false);
    expect(userTable.rows[0]?.['tempPasswordExpiresAt']).toBeNull();
    const again = await authService.login({ phone: OTHER_PHONE, password: 'MyOwnPass123' });
    expect(again.user.mustChangePassword).toBe(false);
  });

  it('generates unambiguous 8-character passwords that differ each time', async () => {
    const { issueTemporaryPassword } = await import('../src/modules/auth/tempPassword.js');
    const first = await issueTemporaryPassword();
    const second = await issueTemporaryPassword();

    expect(first.credential.temporaryPassword).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(first.credential.temporaryPassword).not.toBe(second.credential.temporaryPassword);
    expect(first.hash).not.toContain(first.credential.temporaryPassword);
    expect(new Date(first.credential.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('login', () => {
  it('signs in with the right password', async () => {
    await signUp();
    const session = await authService.login({ phone: PHONE, password: PASSWORD });

    expect(session.user.phone).toBe(PHONE);
    expect(session.user.role).toBe('NON_RESIDENT');
  });

  it('rejects a wrong password', async () => {
    await signUp();
    await expectCode(
      authService.login({ phone: PHONE, password: 'WrongPass123' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('reports an unknown number exactly like a wrong password', async () => {
    // Different responses here would turn login into a membership-list lookup.
    await expectCode(
      authService.login({ phone: OTHER_PHONE, password: PASSWORD }),
      'INVALID_CREDENTIALS',
    );
  });

  it('locks the account after repeated failures', async () => {
    await signUp();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectCode(
        authService.login({ phone: PHONE, password: 'WrongPass123' }),
        'INVALID_CREDENTIALS',
      );
    }

    // The sixth attempt is refused before the password is even considered —
    // and so is the CORRECT password, which is what makes it a lockout.
    await expectCode(authService.login({ phone: PHONE, password: PASSWORD }), 'ACCOUNT_LOCKED');
  });

  it('lets the user back in once the lock expires', async () => {
    await signUp();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectCode(
        authService.login({ phone: PHONE, password: 'WrongPass123' }),
        'INVALID_CREDENTIALS',
      );
    }

    const user = userTable.rows[0];
    if (user === undefined) throw new Error('expected a user row');
    user['lockedUntil'] = new Date(Date.now() - 1_000);

    const session = await authService.login({ phone: PHONE, password: PASSWORD });
    expect(session.user.phone).toBe(PHONE);
    // A successful login clears the counter, so the next mistake starts fresh.
    expect(userTable.rows[0]?.['failedLoginAttempts']).toBe(0);
    expect(userTable.rows[0]?.['lockedUntil']).toBeNull();
  });

  it('refuses a suspended account', async () => {
    await signUp();
    const user = userTable.rows[0];
    if (user === undefined) throw new Error('expected a user row');
    user['status'] = 'SUSPENDED';

    await expectCode(authService.login({ phone: PHONE, password: PASSWORD }), 'ACCOUNT_INACTIVE');
  });
});

describe('sessions', () => {
  it('exchanges a refresh token for a new session', async () => {
    const first = await signUp();
    const second = await authService.refresh({ refreshToken: first.refreshToken });

    expect(second.user.phone).toBe(PHONE);
    // Rotation: the new token must not be the old one.
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });

  it('refuses a refresh token that was already rotated', async () => {
    const first = await signUp();
    await authService.refresh({ refreshToken: first.refreshToken });

    await expectCode(authService.refresh({ refreshToken: first.refreshToken }), 'SESSION_REVOKED');
  });

  it('kills the whole family when a rotated token is replayed', async () => {
    const first = await signUp();
    const second = await authService.refresh({ refreshToken: first.refreshToken });

    // Replaying the old token is the signature of theft: the legitimate device's
    // current token must die too, rather than letting an attacker ride along.
    await expectCode(authService.refresh({ refreshToken: first.refreshToken }), 'SESSION_REVOKED');
    await expectCode(authService.refresh({ refreshToken: second.refreshToken }), 'SESSION_REVOKED');
  });

  it('refuses an expired refresh token', async () => {
    const session = await signUp();
    const row = sessionTable.rows[0];
    if (row === undefined) throw new Error('expected a session row');
    row['expiresAt'] = new Date(Date.now() - 1_000);

    await expectCode(
      authService.refresh({ refreshToken: session.refreshToken }),
      'SESSION_REVOKED',
    );
  });

  it('refuses a refresh token that was never issued', async () => {
    await expectCode(authService.refresh({ refreshToken: 'invented' }), 'SESSION_REVOKED');
  });

  it('revokes the session on logout', async () => {
    const session = await signUp();
    await authService.logout(session.refreshToken);

    await expectCode(
      authService.refresh({ refreshToken: session.refreshToken }),
      'SESSION_REVOKED',
    );
  });

  it('treats logging out twice as success', async () => {
    const session = await signUp();
    await authService.logout(session.refreshToken);
    // Must not throw: the client's job is to forget the token, not to report.
    await expect(authService.logout(session.refreshToken)).resolves.toBeUndefined();
  });
});
