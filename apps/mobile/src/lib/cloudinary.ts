import { apiRequest } from './apiClient';

interface CloudinarySignature {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly timestamp: number;
  readonly signature: string;
  readonly folder: string;
}

/**
 * Uploads a local photo to Cloudinary, signed by the API.
 *
 * The account's API secret stays on the server: it signs the exact upload
 * parameters, and Cloudinary accepts the request only if what the phone sends
 * matches what was signed. The phone never holds anything more than a
 * signature good for this one upload.
 */
export async function uploadToCloudinary(localUri: string): Promise<string> {
  const signed = await apiRequest<CloudinarySignature>('/me/uploads/cloudinary-signature');

  const body = new FormData();
  const fileName = localUri.split('/').pop() ?? 'document.jpg';
  body.append('file', {
    uri: localUri,
    type: 'image/jpeg',
    name: fileName,
  } as unknown as Blob);
  body.append('api_key', signed.apiKey);
  body.append('timestamp', String(signed.timestamp));
  body.append('signature', signed.signature);
  body.append('folder', signed.folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw new Error('Could not upload the photo. Please try again.');
  }

  const payload = (await response.json()) as { secure_url?: string };
  if (payload.secure_url === undefined) {
    throw new Error('The upload succeeded but returned no URL.');
  }
  return payload.secure_url;
}
