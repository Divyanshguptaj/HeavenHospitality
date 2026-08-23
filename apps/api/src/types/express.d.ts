/**
 * Request augmentations shared across middleware.
 *
 * `validated` is populated by the `validate()` middleware and is the *only*
 * sanctioned source of request input — handlers must never read `req.body`,
 * `req.query` or `req.params` directly, because those are unvalidated.
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
