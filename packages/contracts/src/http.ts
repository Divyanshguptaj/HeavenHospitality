import { z } from 'zod';

import { ERROR_CODES } from './errors.js';

/**
 * The one response envelope. Every endpoint returns this shape so clients have a
 * single success/failure branch instead of one per endpoint.
 */
export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
    /** Field-level detail, present only for VALIDATION_FAILED. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: PaginationMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Narrow an envelope without inspecting its internals at the call site. */
export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return response.success === false;
}

// -- Pagination ------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * Page size is capped server-side. An uncapped `pageSize` is a denial-of-service
 * vector and a bulk-exfiltration vector at the same time.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export function buildPaginationMeta(query: PaginationQuery, totalItems: number): PaginationMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
  };
}

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
