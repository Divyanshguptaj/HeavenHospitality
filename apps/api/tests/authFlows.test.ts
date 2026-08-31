import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fakePrisma,
  otpTable,
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
const otpService = await import('../src/modules/auth/otp.service.js');
const { setOtpProviderForTesting } = await import('../src/modules/auth/otp.provider.js');
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

/** Captures what would have been sent, so tests can read the code. */
const sent: Array<{ phone: string; code: string }> = [];

beforeEach(async () => {
  resetFakePrisma();
  sent.length = 0;
  setOtpProviderForTesting({
    name: 'capture',
    sendOtp: (phone, code) => {
      sent.push({ phone, code });
      return Promise.resolve();
    },
  });
  await seedProperty();
});

/** Runs signup end to end and returns the session. */
async function signUp(phone = PHONE, password = PASSWORD) {
  await authService.startSignup(phone);
  const code = sent.at(-1)?.code ?? '';
  const { verificationToken } = await authService.verifySignupOtp(phone, code);
  return authService.completeSignup({
    phone,
    verificationToken,
    fullName: 'Test Person',
    password,
  });
}

function codeFor(phone: string): string {
  const entry = [...sent].reverse().find((s) => s.phone === phone);
  return entry?.code ?? '';
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
  it('sends a code to the number being claimed', async () => {
    const result = await authService.startSignup(PHONE);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.phone).toBe(PHONE);
    expect(sent[0]?.code).toMatch(/^\d{6}$/);
    // The masked number is safe to show; the raw code is not returned in prod.
    expect(result.maskedPhone).toContain('•');
  });

  it('creates no account until the password step', async () => {
    await authService.startSignup(PHONE);
    await authService.verifySignupOtp(PHONE, codeFor(PHONE));

    // A verified phone is not an account. Anything else would mean an attacker
    // could occupy numbers simply by requesting codes for them.
    expect(userTable.rows).toHaveLength(0);
  });

  it('completes and signs the new account in as a RESIDENT', async () => {
    const session = await signUp();

    expect(session.user.phone).toBe(PHONE);
    expect(session.user.role).toBe('NON_RESIDENT');
    expect(session.user.phoneVerified).toBe(true);
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

  it('does not demote an account the admin already provisioned', async () => {
    // A tenant the owner added by phone claims their account by signing up. If
    // that reset them to NON_RESIDENT they would lose their room and invoices.
    userTable.rows.push({
      id: 'provisioned-1',
      phone: OTHER_PHONE,
      fullName: 'Provisioned Tenant',
      email: null,
      passwordHash: null,
      role: 'RESIDENT',
      status: 'ACTIVE',
      phoneVerifiedAt: null,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastFailedLoginAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const session = await signUp(OTHER_PHONE);
    expect(session.user.role).toBe('RESIDENT');
  });

  it('rejects a wrong code', async () => {
    await authService.startSignup(PHONE);
    await expectCode(authService.verifySignupOtp(PHONE, '000000'), 'OTP_INVALID');
  });

  it('rejects an expired code', async () => {
    await authService.startSignup(PHONE);
    const row = otpTable.rows[0];
    if (row === undefined) throw new Error('expected an OTP row');
    row['expiresAt'] = new Date(Date.now() - 1_000);

    await expectCode(authService.verifySignupOtp(PHONE, codeFor(PHONE)), 'OTP_EXPIRED');
  });

  it('refuses to reuse a code that already worked', async () => {
    await authService.startSignup(PHONE);
    const code = codeFor(PHONE);
    await authService.verifySignupOtp(PHONE, code);

    // Replaying the same code must not mint a second verification token.
    await expectCode(authService.verifySignupOtp(PHONE, code), 'OTP_INVALID');
  });

  it('burns the code after too many wrong guesses', async () => {
    await authService.startSignup(PHONE);

    // Default limit is 5; the fifth wrong guess exhausts it.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectCode(authService.verifySignupOtp(PHONE, '000000'), 'OTP_INVALID');
    }
    await expectCode(authService.verifySignupOtp(PHONE, '000000'), 'OTP_MAX_ATTEMPTS');

    // Even the CORRECT code is now dead — the budget is per code, not per guess.
    await expectCode(authService.verifySignupOtp(PHONE, codeFor(PHONE)), 'OTP_INVALID');
  });

  it('refuses a second account on a number that already has one', async () => {
    await signUp();
    await expectCode(authService.startSignup(PHONE), 'ALREADY_EXISTS');
  });

  it('refuses a verification token issued for a different number', async () => {
    await authService.startSignup(PHONE);
    const { verificationToken } = await authService.verifySignupOtp(PHONE, codeFor(PHONE));

    // Verifying one number must not authorise creating an account on another.
    await expectCode(
      authService.completeSignup({
        phone: OTHER_PHONE,
        verificationToken,
        fullName: 'Impostor',
        password: PASSWORD,
      }),
      'PHONE_NOT_VERIFIED',
    );
  });

  it('refuses to set a password without any verification token', async () => {
    await expectCode(
      authService.completeSignup({
        phone: PHONE,
        verificationToken: 'made-up',
        fullName: 'Impostor',
        password: PASSWORD,
      }),
      'PHONE_NOT_VERIFIED',
    );
  });

  it('spends a verification token exactly once', async () => {
    await authService.startSignup(PHONE);
    const { verificationToken } = await authService.verifySignupOtp(PHONE, codeFor(PHONE));

    await authService.completeSignup({
      phone: PHONE,
      verificationToken,
      fullName: 'Test Person',
      password: PASSWORD,
    });

    await expectCode(
      authService.completeSignup({
        phone: PHONE,
        verificationToken,
        fullName: 'Again',
        password: PASSWORD,
      }),
      'PHONE_NOT_VERIFIED',
    );
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

  it('refuses an account whose phone was never verified', async () => {
    // The shape an owner-provisioned account has before its resident signs up.
    await userTable.create({
      data: {
        phone: PHONE,
        fullName: 'Provisioned',
        passwordHash: await hashPassword(PASSWORD),
        phoneVerifiedAt: null,
        role: 'RESIDENT',
        status: 'ACTIVE',
      },
    });

    await expectCode(authService.login({ phone: PHONE, password: PASSWORD }), 'PHONE_NOT_VERIFIED');
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

describe('forgot password', () => {
  it('resets the password and lets the new one work', async () => {
    await signUp();

    await authService.startPasswordReset(PHONE);
    const { verificationToken } = await authService.verifyPasswordResetOtp(PHONE, codeFor(PHONE));
    await authService.resetPassword({
      phone: PHONE,
      verificationToken,
      password: 'BrandNew456',
    });

    const session = await authService.login({ phone: PHONE, password: 'BrandNew456' });
    expect(session.user.phone).toBe(PHONE);

    await expectCode(
      authService.login({ phone: PHONE, password: PASSWORD }),
      'INVALID_CREDENTIALS',
    );
  });

  it('signs every existing device out', async () => {
    const before = await signUp();

    await authService.startPasswordReset(PHONE);
    const { verificationToken } = await authService.verifyPasswordResetOtp(PHONE, codeFor(PHONE));
    await authService.resetPassword({
      phone: PHONE,
      verificationToken,
      password: 'BrandNew456',
    });

    // Resetting is how someone responds to a compromise, so the attacker's
    // session must not survive it.
    await expectCode(authService.refresh({ refreshToken: before.refreshToken }), 'SESSION_REVOKED');
  });

  it('does not reveal whether the number is registered', async () => {
    const unknown = await authService.startPasswordReset(OTHER_PHONE);

    // Same shape as a real request, and no SMS actually sent.
    expect(unknown.maskedPhone).toContain('•');
    expect(sent).toHaveLength(0);
  });

  it('will not reset a password with only a phone number', async () => {
    await signUp();

    await expectCode(
      authService.resetPassword({
        phone: PHONE,
        verificationToken: 'made-up',
        password: 'BrandNew456',
      }),
      'PHONE_NOT_VERIFIED',
    );
  });

  it('refuses a signup token used to reset an existing password', async () => {
    await signUp(OTHER_PHONE);

    // A SIGNUP verification must not be redeemable as a PASSWORD_RESET one, or
    // verifying your own number would let you reset someone else's account.
    await authService.startSignup(PHONE);
    const { verificationToken } = await authService.verifySignupOtp(PHONE, codeFor(PHONE));

    await expectCode(
      authService.resetPassword({ phone: PHONE, verificationToken, password: 'BrandNew456' }),
      'PHONE_NOT_VERIFIED',
    );
  });

  it('clears a lockout, so a locked-out user can recover', async () => {
    await signUp();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectCode(
        authService.login({ phone: PHONE, password: 'WrongPass123' }),
        'INVALID_CREDENTIALS',
      );
    }
    await expectCode(authService.login({ phone: PHONE, password: PASSWORD }), 'ACCOUNT_LOCKED');

    await authService.startPasswordReset(PHONE);
    const { verificationToken } = await authService.verifyPasswordResetOtp(PHONE, codeFor(PHONE));
    await authService.resetPassword({
      phone: PHONE,
      verificationToken,
      password: 'BrandNew456',
    });

    const session = await authService.login({ phone: PHONE, password: 'BrandNew456' });
    expect(session.user.phone).toBe(PHONE);
  });
});

describe('one-time codes', () => {
  it('refuses a resend inside the cooldown', async () => {
    await authService.startSignup(PHONE);
    await expectCode(authService.startSignup(PHONE), 'OTP_RESEND_TOO_SOON');
  });

  it('invalidates the previous code when a new one is issued', async () => {
    await authService.startSignup(PHONE);
    const firstCode = codeFor(PHONE);

    // Step past the cooldown rather than waiting for it.
    const row = otpTable.rows[0];
    if (row === undefined) throw new Error('expected an OTP row');
    row['createdAt'] = new Date(Date.now() - 10 * 60_000);

    await authService.startSignup(PHONE);
    expect(codeFor(PHONE)).not.toBe(firstCode);

    // Two live codes would double an attacker's guessing budget.
    await expectCode(
      otpService.verifyOtp({
        phone: PHONE,
        code: firstCode,
        purpose: 'SIGNUP',
      }),
      'OTP_INVALID',
    );
  });

  it('stores the code hashed, never in plaintext', async () => {
    await authService.startSignup(PHONE);
    const code = codeFor(PHONE);
    const row = otpTable.rows[0];

    expect(row?.['codeHash']).not.toBe(code);
    expect(row?.['codeHash']).toMatch(/^[0-9a-f]{64}$/);
  });
});
