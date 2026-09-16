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
