import { AppError } from '../../errors/AppError.js';
import {
  toPublicPropertyDetail,
  toPublicPropertySummary,
  type PublicPropertyDetail,
  type PublicPropertySummary,
} from './public.mapper.js';
import { findPublicPropertyBySlug, listPublicProperties } from './public.repository.js';

/**
 * A very small TTL cache for unauthenticated reads.
 *
 * The guest experience is public, identical for every viewer, and changes only
 * when staff edit the property — so a few seconds of staleness costs nothing and
 * blunts scraping. Deliberately a plain Map, not Redis: it holds a handful of
 * entries, and losing it on restart has no consequence.
 */
const CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Exposed so tests and (later) admin writes can invalidate deterministically. */
export function clearPublicCache(): void {
  cache.clear();
}

export async function getPublicProperty(slug: string): Promise<PublicPropertyDetail> {
  return cached(`property:${slug}`, async () => {
    const property = await findPublicPropertyBySlug(slug);

    // An unlisted or inactive property is reported as NOT_FOUND, never FORBIDDEN.
    // A 403 would confirm the slug exists and let someone enumerate properties
    // the owner has deliberately withdrawn from public view.
    if (property === null) {
      throw new AppError('NOT_FOUND', 'We could not find that property.');
    }

    return toPublicPropertyDetail(property);
  });
}

export async function getPublicProperties(): Promise<PublicPropertySummary[]> {
  return cached('properties', async () => {
    const properties = await listPublicProperties();
    return properties.map(toPublicPropertySummary);
  });
}
