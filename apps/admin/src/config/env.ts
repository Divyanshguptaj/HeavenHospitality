import { z } from 'zod';

/**
 * Browser environment.
 *
 * Only `VITE_`-prefixed variables are inlined into the bundle, and everything in
 * the bundle is public. No secret may ever appear here — API keys, provider
 * secrets and database URLs stay on the server. See docs/0008-data-protection.md.
 */
const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default('http://localhost:4000/api/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid admin environment configuration:\n${problems}`);
}

export const env = parsed.data;
