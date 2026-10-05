import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const MAX_ENV_SEARCH_DEPTH = 6;

/**
 * Loads the nearest `.env`, searching upward from this module.
 *
 * The search exists because pnpm runs scripts with the *package* directory as the
 * working directory, so a plain `process.loadEnvFile()` would miss the single
 * `.env` at the repository root. Walking up from the module also works identically
 * whether running from `src/` via tsx or from `dist/` after a build.
 *
 * A package-level `.env` wins over the root one, which is what you want if an app
 * ever needs to override a value locally.
 *
 * Node's built-in loader is used instead of `dotenv` — one less dependency, and it
 * never overrides variables already set by the host, which makes it safe to call
 * in production too.
 */
function loadDotEnvIfPresent(): void {
  let directory = path.dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < MAX_ENV_SEARCH_DEPTH; depth += 1) {
    const candidate = path.join(directory, '.env');
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        // Unreadable or malformed: fall through to schema validation, which
        // produces a far better message than a parse error would.
      }
      return;
    }

    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

const SECRET_MIN_LENGTH = 32;

const csvToArray = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'Must be a duration such as 15m, 24h or 30d');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Neon: DATABASE_URL is the pooled endpoint, DIRECT_DATABASE_URL the unpooled
    // one used by Prisma Migrate. See apps/api/prisma/schema.prisma.
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .startsWith('postgres', 'Must be a PostgreSQL connection string'),
    DIRECT_DATABASE_URL: z
      .string()
      .startsWith('postgres', 'Must be a PostgreSQL connection string')
      .optional(),

    // Auth — see docs/0003-auth-and-sessions.md
    JWT_ACCESS_SECRET: z.string().min(SECRET_MIN_LENGTH),
    JWT_REFRESH_SECRET: z.string().min(SECRET_MIN_LENGTH),
    ACCESS_TOKEN_TTL: durationSchema.default('15m'),
    REFRESH_TOKEN_TTL: durationSchema.default('30d'),
    ACCOUNT_LOCKOUT_THRESHOLD: z.coerce.number().int().min(1).default(5),
    ACCOUNT_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
    TEMP_PASSWORD_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),

    // The first owner. Without these the seed still runs, using its documented
    // development defaults; production must set them explicitly.
    BOOTSTRAP_OWNER_PHONE: z.string().optional(),
    BOOTSTRAP_OWNER_PASSWORD: z.string().optional(),
    BOOTSTRAP_OWNER_NAME: z.string().optional(),

    // Property defaults — business rules run in the property's timezone.
    DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),

    // CORS: an explicit allowlist. Never `*` for a credentialed API.
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173').transform(csvToArray),

    // Request limits
    JSON_BODY_LIMIT: z.string().default('100kb'),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 1024 * 1024),
    RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(300),

    // Optional integrations. Absent means the feature is disabled, never that it
    // silently half-works.
    SENTRY_DSN: z.string().url().optional(),


    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().default('heaven-hospitality/registration-documents'),
    CLOUDINARY_GALLERY_FOLDER: z.string().default('heaven-hospitality/gallery'),

    /** Only needed if Expo push security ("enhanced") is turned on for the project. */
    EXPO_ACCESS_TOKEN: z.string().optional(),

    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('Heaven Hospitality <no-reply@heavenhospitality.in>'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    // Production must not start with a half-configured integration. Failing at
    // boot is far better than discovering it at the first payment.
    // Neon requires TLS. A connection string without it either fails to connect or,
    // worse, silently downgrades on a proxy that permits it.
    if (!/sslmode=(require|verify-ca|verify-full)/.test(value.DATABASE_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'Production database connections must set sslmode=require',
      });
    }

    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }

    if (value.CORS_ALLOWED_ORIGINS.some((origin) => origin.startsWith('http://'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'Production origins must use HTTPS',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * An empty environment variable means "not set", never "set to the empty string".
 *
 * `FOO=` in a .env file, an unset variable in a CI matrix and a deliberately
 * blanked override all arrive here as `''`. Passing that through makes every
 * optional field fail its own format check — an empty DSN is not a URL — which turns "I did not configure this"
 * into a startup crash.
 */
function withoutBlanks(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

function parseEnv(): Env {
  loadDotEnvIfPresent();
  const result = envSchema.safeParse(withoutBlanks(process.env));

  if (!result.success) {
    // Deliberately not the logger: configuration failed, so the logger may not be
    // configurable either. Names only — never the offending values.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    process.stderr.write(`Invalid environment configuration:\n${problems}\n`);
    process.exit(1);
  }

  return result.data;
}

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** Integrations are enabled by configuration, never by a feature flag in code. */
export const features = {
  sentry: env.SENTRY_DSN !== undefined,
  objectStorage: env.S3_BUCKET !== undefined,
  email: env.SMTP_URL !== undefined,
  cloudinary:
    env.CLOUDINARY_CLOUD_NAME !== undefined &&
    env.CLOUDINARY_API_KEY !== undefined &&
    env.CLOUDINARY_API_SECRET !== undefined,
} as const;
