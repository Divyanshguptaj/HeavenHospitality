import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

import { AppError, type ErrorDetail } from '../errors/AppError.js';

export interface ValidationSchemas {
  readonly body?: ZodTypeAny;
  readonly query?: ZodTypeAny;
  readonly params?: ZodTypeAny;
}

/** The parsed shape produced by a given set of schemas. */
export type Validated<S extends ValidationSchemas> = {
  readonly body: S['body'] extends ZodTypeAny ? z.infer<S['body']> : undefined;
  readonly query: S['query'] extends ZodTypeAny ? z.infer<S['query']> : undefined;
  readonly params: S['params'] extends ZodTypeAny ? z.infer<S['params']> : undefined;
};

/**
 * Validates a request against Zod schemas before a handler ever sees it.
 *
 * Results are written to `req.validated` rather than back onto `req.body` /
 * `req.query`, because in Express 5 `req.query` is a getter and cannot be
 * reassigned — and because keeping raw and validated input distinct means a
 * handler that reads the raw value is visibly wrong.
 *
 * All three sources are validated in one pass so the client receives every
 * problem at once instead of discovering them one request at a time.
 */
export function validate<S extends ValidationSchemas>(schemas: S): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const details: ErrorDetail[] = [];
    const validated: { body?: unknown; query?: unknown; params?: unknown } = {};

    for (const source of ['body', 'query', 'params'] as const) {
      const schema = schemas[source];
      if (schema === undefined) continue;

      const result = schema.safeParse(req[source]);
      if (result.success) {
        validated[source] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({
            path: [source, ...issue.path.map(String)].join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (details.length > 0) {
      next(new AppError('VALIDATION_FAILED', 'The request contains invalid data.', { details }));
      return;
    }

    req.validated = validated;
    next();
  };
}

/**
 * Reads the validated input for a route.
 *
 * The cast is confined to this one function: `validate()` guarantees the shape,
 * but Express's `Request` type cannot express the link between the middleware and
 * the handler. Calling this on a route without a matching `validate()` throws
 * rather than silently handing back `undefined`.
 */
export function getValidated<S extends ValidationSchemas>(req: Request): Validated<S> {
  if (req.validated === undefined) {
    throw new Error(
      'getValidated() called on a route with no validate() middleware — this is a wiring bug.',
    );
  }
  return req.validated as Validated<S>;
}
