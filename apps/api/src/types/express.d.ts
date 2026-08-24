/**
 * Request augmentations shared across middleware.
 *
 * `validated` is populated by the `validate()` middleware and is the *only*
 * sanctioned source of request input — handlers must never read `req.body`,
 * `req.query` or `req.params` directly, because those are unvalidated.
 */
import type { Actor } from '../middleware/authenticate.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      /**
       * Set by requireAuth(). Absent on public routes — which is why it is
       * optional and why `getActor()` throws rather than returning undefined.
       */
      actor?: Actor;
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
