import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/AppError.js';

/** Unknown routes go through the same error envelope as everything else. */
export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', 'The requested endpoint does not exist.'));
}
