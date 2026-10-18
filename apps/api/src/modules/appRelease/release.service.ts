import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface UpdateAsset {
  readonly url: string;
  readonly hash: string;
  readonly key: string;
  readonly contentType: string;
  readonly fileExtension: string | null;
}

/** One published JS bundle, exactly as `scripts/release` writes it to the bucket. */
export interface UpdateRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly runtimeVersion: string;
  readonly launchAsset: UpdateAsset;
  readonly assets: readonly UpdateAsset[];
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface AppVersionInfo {
  readonly latestVersionCode: number;
  readonly minVersionCode: number;
  readonly apkUrl: string | null;
  readonly notes: string | null;
}

const CACHE_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
const RUNTIME_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

const cache = new Map<string, { readonly at: number; readonly value: unknown }>();

/** Reads a JSON file from the releases bucket; null when absent or unreachable. */
async function readReleaseFile<T>(relativePath: string): Promise<T | null> {
  const base = env.APP_RELEASES_BASE_URL;
  if (base === undefined) return null;

  const cached = cache.get(relativePath);
  if (cached !== undefined && Date.now() - cached.at < CACHE_MS) return cached.value as T | null;

  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/${relativePath}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 403 || response.status === 404) {
      cache.set(relativePath, { at: Date.now(), value: null });
      return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = (await response.json()) as T;
    cache.set(relativePath, { at: Date.now(), value });
    return value;
  } catch (error) {
    logger.warn({ err: error, relativePath }, 'could not read release file');
    return (cached?.value as T | undefined) ?? null;
  }
}

export function isValidRuntimeVersion(value: string): boolean {
  return RUNTIME_VERSION_PATTERN.test(value);
}

export async function getLatestUpdate(runtimeVersion: string): Promise<UpdateRecord | null> {
  if (!isValidRuntimeVersion(runtimeVersion)) return null;
  return readReleaseFile<UpdateRecord>(`updates/${runtimeVersion}/latest.json`);
}

export async function getAppVersionInfo(): Promise<AppVersionInfo> {
  const file = await readReleaseFile<Partial<AppVersionInfo>>('release/android.json');
  return {
    latestVersionCode: file?.latestVersionCode ?? 0,
    minVersionCode: file?.minVersionCode ?? 0,
    apkUrl: file?.apkUrl ?? null,
    notes: file?.notes ?? null,
  };
}

export interface MultipartReply {
  readonly contentType: string;
  readonly body: string;
}

function multipart(name: 'manifest' | 'directive', payload: unknown): MultipartReply {
  const boundary = `hh-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    `content-disposition: form-data; name="${name}"\r\n` +
    'content-type: application/json; charset=utf-8\r\n\r\n' +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--\r\n`;
  return { contentType: `multipart/mixed; boundary=${boundary}`, body };
}

/** The reply that hands a device a new bundle. */
export function updateReply(record: UpdateRecord): MultipartReply {
  return multipart('manifest', {
    id: record.id,
    createdAt: record.createdAt,
    runtimeVersion: record.runtimeVersion,
    launchAsset: record.launchAsset,
    assets: record.assets,
    metadata: {},
    extra: record.extra,
  });
}

/** The reply that tells a device it already has the newest bundle. */
export function noUpdateReply(): MultipartReply {
  return multipart('directive', { type: 'noUpdateAvailable' });
}

/** Decides what a device on `currentUpdateId` should be told. */
export function replyFor(record: UpdateRecord | null, currentUpdateId: string | undefined): MultipartReply {
  if (record === null || record.id === currentUpdateId) return noUpdateReply();
  return updateReply(record);
}

/** Forgets cached release files. */
export function clearReleaseCache(): void {
  cache.clear();
}
