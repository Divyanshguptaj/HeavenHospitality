/**
 * Thrown whenever a monetary value or operation is invalid.
 *
 * Money errors are always programmer/input errors, never expected control flow —
 * callers should validate with Zod at the API boundary so this never surfaces to
 * a user as a 500.
 */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}
