/**
 * Re-encode a photo to JPEG and drop remaining EXIF/GPS before any upload
 * to diary-photos or post-photos. Uses expo-image-manipulator (native; needs
 * a new dev-client/fieldtest build) then the pure-JS JPEG segment stripper
 * already in this repo (see stripJpegMetadata.ts / stripJpegMetadata.mjs).
 *
 * If the native module is missing (today's fieldtest client), fail closed:
 * never upload raw bytes, and show PHOTO_ADD_UPDATE_APP_MESSAGE.
 */
import { ImageManipulator, SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { getExpoImageManipulatorNative } from '@/lib/photoManipulatorNative';
import { stripJpegMetadata } from '@/lib/stripJpegMetadata';

export const PHOTO_UPLOAD_BUCKETS = ['diary-photos', 'post-photos'] as const;
export type PhotoUploadBucket = (typeof PHOTO_UPLOAD_BUCKETS)[number];

/** Friendly error when this JS is running on a client without the native module. */
export const PHOTO_ADD_UPDATE_APP_MESSAGE = 'Update the app to add photos.';

export function isPhotoManipulatorAvailable(): boolean {
  const native = getExpoImageManipulatorNative();
  return !!native && typeof native.manipulate === 'function';
}

function release(obj: { release?: () => void } | null | undefined) {
  try {
    obj?.release?.();
  } catch {
    // ignore
  }
}

async function manipulateToJpeg(localUri: string): Promise<{ uri: string }> {
  const opts = { format: SaveFormat.JPEG, compress: 0.92 };
  if (ImageManipulator && typeof ImageManipulator.manipulate === 'function') {
    const context = ImageManipulator.manipulate(localUri);
    let image: { saveAsync: (o: object) => Promise<{ uri: string }>; release?: () => void } | undefined;
    try {
      image = await context.renderAsync();
      return await image.saveAsync(opts);
    } finally {
      release(image);
      release(context as { release?: () => void });
    }
  }
  return manipulateAsync(localUri, [], opts);
}

/** Re-encode `localUri` and return only the cleaned JPEG bytes. Never returns the original file. */
export async function reencodePhotoForUpload(localUri: string): Promise<Uint8Array> {
  if (!isPhotoManipulatorAvailable()) {
    throw new Error(PHOTO_ADD_UPDATE_APP_MESSAGE);
  }
  let saved: { uri: string };
  try {
    saved = await manipulateToJpeg(localUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/native module|ExponentImageManipulator|ExpoImageManipulator|cannot find|not found|undefined is not a function/i.test(msg)) {
      throw new Error(PHOTO_ADD_UPDATE_APP_MESSAGE);
    }
    throw e;
  }
  if (!saved?.uri) throw new Error('photo re-encode produced no file');
  const res = await fetch(saved.uri);
  if (!res.ok) throw new Error('failed to read re-encoded photo');
  const bytes = new Uint8Array(await res.arrayBuffer());
  return stripJpegMetadata(bytes);
}

export function isPhotoUploadBucket(bucket: string): bucket is PhotoUploadBucket {
  return (PHOTO_UPLOAD_BUCKETS as readonly string[]).includes(bucket);
}
