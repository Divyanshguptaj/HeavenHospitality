import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing.
 *
 * Parameters follow OWASP's password-storage guidance: 19 MiB of memory, two
 * iterations, one degree of parallelism. Memory cost is what makes GPU cracking
 * expensive, which is the whole point of choosing Argon2id over bcrypt.
 *
 * The salt is generated per hash and embedded in the encoded output, so no salt
 * column is needed and two identical passwords never share a hash.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash: a corrupt row must fail
 * the login, not crash the request and reveal that the account exists.
 */
export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * A dummy verification used when no account matches the supplied identifier.
 *
 * Without it, a missing user returns in ~1 ms while a real user costs ~50 ms of
 * Argon2 work, and that timing difference alone lets an attacker enumerate which
 * phone numbers and emails are registered. Doing the same work in both branches
 * removes the signal.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$J4moa2Ye5xLbcJnBqPQ1eUCFF6mGB6ZKPCoNMbFqzXo';

export async function performDummyVerification(plainPassword: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, plainPassword);
}
