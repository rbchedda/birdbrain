/**
 * Re-encode a photo to JPEG and drop remaining EXIF/GPS before any upload
 * to diary-photos or post-photos. Uses expo-image-manipulator (native; needs
 * a new dev-client/fieldtest build) then the pure-JS JPEG segment stripper
 * already in this repo (see stripJpegMetadata.ts / stripJpegMetadata.mjs).
 */
import { ImageManipulator, SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { stripJpegMetadata } from '@/lib/stripJpegMetadata';

export const PHOTO_UPLOAD_BUCKETS = ['diary-photos', 'post-photos'] as const;
export type PhotoUploadBucket = (typeof PHOTO_UPLOAD_BUCKETS)[number];

async function manipulateToJpeg(localUri: string): Promise<{ uri: string }> {
  const opts = { format: SaveFormat.JPEG, compress: 0.92 };
  if (ImageManipulator && typeof ImageManipulator.manipulate === 'function') {
    const image = await ImageManipulator.manipulate(localUri).renderAsync();
    return image.saveAsync(opts);
  }
  return manipulateAsync(localUri, [], opts);
}

/** Re-encode `localUri` and return only the cleaned JPEG bytes. Never returns the original file. */
export async function reencodePhotoForUpload(localUri: string): Promise<Uint8Array> {
  const saved = await manipulateToJpeg(localUri);
  if (!saved?.uri) throw new Error('photo re-encode produced no file');
  const res = await fetch(saved.uri);
  if (!res.ok) throw new Error('failed to read re-encoded photo');
  const bytes = new Uint8Array(await res.arrayBuffer());
  return stripJpegMetadata(bytes);
}

export function isPhotoUploadBucket(bucket: string): bucket is PhotoUploadBucket {
  return (PHOTO_UPLOAD_BUCKETS as readonly string[]).includes(bucket);
}
