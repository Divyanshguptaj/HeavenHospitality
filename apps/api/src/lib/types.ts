/**
 * Every property optional *and* explicitly `| undefined`.
 *
 * `exactOptionalPropertyTypes` distinguishes "absent" from "present but
 * undefined". Zod's `.optional()` produces the latter, so a service parameter
 * typed `{ search?: string }` will not accept `{ search: string | undefined }`.
 *
 * Using this on inputs that come from validated request data keeps the strict
 * flag switched on everywhere else, where it genuinely catches bugs, instead of
 * loosening the compiler for the whole project.
 */
export type Loose<T> = { [K in keyof T]?: T[K] | undefined };
