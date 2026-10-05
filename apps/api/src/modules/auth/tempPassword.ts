import { randomInt } from 'node:crypto';

import type { TemporaryCredentialView } from '@heaven/contracts';

import { env } from '../../config/env.js';
import { hashPassword } from './password.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

export interface IssuedTemporaryPassword {
  readonly hash: string;
  readonly expiresAt: Date;
  readonly credential: TemporaryCredentialView;
}

/** Generates a random temporary password and its hash and expiry; only the hash is ever stored. */
export async function issueTemporaryPassword(): Promise<IssuedTemporaryPassword> {
  const temporaryPassword = Array.from({ length: LENGTH }, () =>
    ALPHABET.charAt(randomInt(ALPHABET.length)),
  ).join('');
  const expiresAt = new Date(Date.now() + env.TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1_000);

  return {
    hash: await hashPassword(temporaryPassword),
    expiresAt,
    credential: { temporaryPassword, expiresAt: expiresAt.toISOString() },
  };
}
