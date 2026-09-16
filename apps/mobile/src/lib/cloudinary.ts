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
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
    // A remote stand-in (the "test photo" button) rather than something the
    // device picked — fetched into a blob so it uploads the same way either way.
    let source: Response;
    try {
      source = await fetch(localUri);
    } catch (cause) {
      console.error('[cloudinary] could not fetch the test photo', localUri, cause);
      throw new Error('Could not reach the test photo — check the phone has an internet connection.');
    }
    body.append('file', await source.blob(), 'document.jpg');
  } else {
    const fileName = localUri.split('/').pop() ?? 'document.jpg';
    body.append('file', {
      uri: localUri,
      type: 'image/jpeg',
      name: fileName,
    } as unknown as Blob);
  }
  body.append('api_key', signed.apiKey);
  body.append('timestamp', String(signed.timestamp));
  body.append('signature', signed.signature);
  body.append('folder', signed.folder);

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
      method: 'POST',
      body,
    });
  } catch (cause) {
    // Cloudinary is on the public internet, not behind the local dev tunnel —
    // this fails whenever the phone itself has no working WiFi or mobile data,
    // independent of whether the API is reachable.
    console.error('[cloudinary] upload request failed', cause);
    throw new Error('Could not reach Cloudinary — check the phone has an internet connection (WiFi or mobile data).');
  }

  if (!response.ok) {
    const responseText = await response.text();
    console.error('[cloudinary] upload rejected', response.status, responseText);
    throw new Error('Cloudinary rejected the upload. Please try again.');
  }

  const payload = (await response.json()) as { secure_url?: string };
  if (payload.secure_url === undefined) {
    throw new Error('The upload succeeded but returned no URL.');
  }
  return payload.secure_url;
}
