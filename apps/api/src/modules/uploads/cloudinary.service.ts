import { createHash } from 'node:crypto';

import { AppError } from '../../errors/AppError.js';
import { env, features } from '../../config/env.js';

export interface CloudinarySignature {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly timestamp: number;
  readonly signature: string;
  readonly folder: string;
}

/**
 * A short-lived signature for one direct-to-Cloudinary upload.
 *
 * The API secret never leaves this server: it signs the exact parameters the
 * client will send, and Cloudinary accepts the upload only if the client's
 * request matches what was signed. The client gets a signature good for one
 * upload, never the secret itself.
 */
export function createUploadSignature(): CloudinarySignature {
  if (!features.cloudinary) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Photo uploads are not configured yet.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = env.CLOUDINARY_FOLDER;

  // Cloudinary's signing rule: every parameter that will be sent to the upload
  // API (other than file, cloud_name, resource_type and the key itself), sorted
  // alphabetically by name, joined as `key=value&key=value`, secret appended.
  const toSign = `folder=${folder}&timestamp=${String(timestamp)}${env.CLOUDINARY_API_SECRET as string}`;
  const signature = createHash('sha1').update(toSign).digest('hex');

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: env.CLOUDINARY_API_KEY as string,
    timestamp,
    signature,
    folder,
  };
}

/** The id Cloudinary destroys by — everything after `/upload/[v<version>/]`, minus the extension. */
function publicIdFromUrl(url: string): string | null {
  const match = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Deletes a previously uploaded document photo, once nothing points at it any
 * more — a registration edit that replaces the Aadhaar photo would otherwise
 * leave the old one on Cloudinary forever, never reachable from the app again
 * but still billed and stored.
 *
 * Best-effort: this runs after the database already holds the new photo, so a
 * failure here must never surface as a failure to save the edit itself.
 */
export async function deleteCloudinaryAsset(url: string): Promise<void> {
  if (!features.cloudinary) return;

  const publicId = publicIdFromUrl(url);
  if (publicId === null) {
    console.warn('[cloudinary] could not parse a public id to delete from', url);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${String(timestamp)}${env.CLOUDINARY_API_SECRET as string}`;
  const signature = createHash('sha1').update(toSign).digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    api_key: env.CLOUDINARY_API_KEY as string,
    timestamp: String(timestamp),
    signature,
  });

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME as string}/image/destroy`,
      { method: 'POST', body },
    );
    if (!response.ok) {
      console.error('[cloudinary] failed to delete old asset', publicId, response.status, await response.text());
    }
  } catch (cause) {
    console.error('[cloudinary] delete request for old asset failed', publicId, cause);
  }
}
