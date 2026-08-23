import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Attaches a correlation id to every request and echoes it back.
 *
 * An inbound id is honoured so a trace survives a proxy, but only if it is short
 * and alphanumeric: an unchecked header ends up in log lines, and a value with
 * newlines in it is log injection.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get(REQUEST_ID_HEADER);
  req.requestId = inbound !== undefined && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
}
