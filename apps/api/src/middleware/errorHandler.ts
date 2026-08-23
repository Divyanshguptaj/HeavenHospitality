import type { ApiError } from '@heaven/contracts';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../config/env.js';
import { AppError, isAppError } from '../errors/AppError.js';
import { logger } from '../lib/logger.js';

/** Express marks a body-parser failure with `type` and a status. */
function isBodyParserError(error: unknown): error is { type: string; status?: number } {
  return typeof error === 'object' && error !== null && 'type' in error;
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new AppError('VALIDATION_FAILED', 'The request contains invalid data.', {
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return new AppError('PAYLOAD_TOO_LARGE', 'The request body is too large.');
    }
    if (error.type === 'entity.parse.failed') {
      return new AppError('MALFORMED_JSON', 'The request body is not valid JSON.');
    }
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      return new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported content encoding.');
    }
  }

  // Anything reaching here is a bug. The client is told nothing about it.
  return new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Stack traces, SQL text, Prisma internals and provider payloads never cross this
 * boundary in production — the client gets a code, a safe message and the request
 * id needed to correlate with a log entry.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);

  const logPayload = {
    requestId: req.requestId,
    code: appError.code,
    status: appError.status,
    method: req.method,
    path: req.path,
    ...(appError.context ?? {}),
  };

  if (appError.status >= 500) {
    // The original error is logged, not the sanitised one, so the stack survives.
    logger.error({ ...logPayload, err: error }, 'Unhandled request error');
  } else {
    logger.warn(logPayload, appError.message);
  }

  const body: ApiError = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      requestId: req.requestId,
      ...(appError.details === undefined ? {} : { details: [...appError.details] }),
    },
  };

  // Development keeps the stack out of the response body too — it goes to the
  // logs. Responses have one shape everywhere so clients cannot come to depend on
  // a field that disappears in production.
  if (!isProduction && appError.status >= 500) {
    logger.debug({ requestId: req.requestId, err: error }, 'Error detail');
  }

  res.status(appError.status).json(body);
}
