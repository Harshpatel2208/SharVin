import { randomUUID } from 'crypto';

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export type CloudUploadTarget =
  | { provider: 's3'; bucket: string }
  | { provider: 'cloudinary'; connectionUrl: string };

export interface ImageUploadInput {
  data: Buffer;
  contentType: ImageContentType;
}

export interface UploadedImage {
  storage: 'inline' | CloudUploadTarget['provider'];
  url: string;
  contentType: ImageContentType;
  sizeBytes: number;
}

// Implement this adapter using the chosen cloud SDK. Resolve only after the
// upload completes; return a durable HTTPS URL, not an expiring signed URL.
export type CloudImageUploader = (input: ImageUploadInput & {
  objectKey: string;
  target: CloudUploadTarget;
}) => Promise<string>;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const extensions: Record<ImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function matchesImageSignature(data: Buffer, contentType: ImageContentType): boolean {
  switch (contentType) {
    case 'image/jpeg':
      return data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/png':
      return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/webp':
      return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    default:
      return false;
  }
}

export class UploadService {
  /** Routes must authorize the upload and enforce body limits before calling. */
  static async uploadImage(input: ImageUploadInput, cloudUploader?: CloudImageUploader): Promise<UploadedImage> {
    if (!Buffer.isBuffer(input.data) || input.data.length === 0 || input.data.length > MAX_IMAGE_BYTES) {
      throw new Error('Image must contain between 1 byte and 5 MiB.');
    }
    if (!matchesImageSignature(input.data, input.contentType)) {
      throw new Error('Only JPEG, PNG, and WebP images with matching content types are supported.');
    }

    const bucket = process.env.AWS_S3_BUCKET?.trim();
    const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
    const target: CloudUploadTarget | undefined = bucket
      ? { provider: 's3', bucket }
      : cloudinaryUrl ? { provider: 'cloudinary', connectionUrl: cloudinaryUrl } : undefined;

    if (target) {
      if (!cloudUploader) {
        throw new Error(`Cloud storage is configured for ${target.provider}, but its upload adapter is not installed.`);
      }
      const url = await cloudUploader({
        ...input,
        objectKey: `images/${randomUUID()}.${extensions[input.contentType]}`,
        target,
      });
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
        throw new Error('Cloud upload adapter must return an HTTPS URL without credentials.');
      }
      return { storage: target.provider, url, contentType: input.contentType, sizeBytes: input.data.length };
    }

    // The caller must persist this data URI in its database record. No file is
    // written to ephemeral disk. Never silently fall back after a cloud failure.
    return {
      storage: 'inline',
      url: `data:${input.contentType};base64,${input.data.toString('base64')}`,
      contentType: input.contentType,
      sizeBytes: input.data.length,
    };
  }
}
