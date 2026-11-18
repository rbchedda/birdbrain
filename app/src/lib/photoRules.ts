import type { ImagePickerAsset } from 'expo-image-picker';

/** Pure photo rules shared by the picker, the backends and tests (no native imports). */

/** Storage bucket cap (20261027000400_storage_limits / 20261110002000). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Bucket allow-list (same migrations). */
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type PhotoMimeType = (typeof ALLOWED_PHOTO_TYPES)[number];
/** posts.photo_path is a single text column: one photo per post. */
export const MAX_POST_PHOTOS = 1;
/** diary_entries.details.photos is a list of paths inside a 16 KB JSON cap; 6 keeps entries small. */
export const MAX_DIARY_PHOTOS = 6;

export class PhotoError extends Error {}

const EXT_TYPES: Record<string, PhotoMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
};

/** Normalise a picker MIME type (or fall back to the file extension); null when not allowed. */
export function photoMimeType(mimeType: string | null | undefined, nameOrUri?: string | null): PhotoMimeType | null {
  const m = (mimeType ?? '').toLowerCase().trim();
  if (m) {
    if (m === 'image/jpg' || m === 'image/pjpeg') return 'image/jpeg';
    if (m === 'image/heif') return 'image/heic';
    return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(m) ? (m as PhotoMimeType) : null;
  }
  const ext = (nameOrUri ?? '').split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? null;
}

/** File extension used in storage paths. */
export function photoExtension(mimeType: string | null | undefined): string {
  switch (photoMimeType(mimeType)) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    default:
      return 'jpg';
  }
}

/** Checks a picker asset against the bucket rules; throws a PhotoError with plain-language text. */
export function validatePickedAsset(asset: Pick<ImagePickerAsset, 'uri' | 'mimeType' | 'fileName' | 'fileSize' | 'type'>): PhotoMimeType {
  if (asset.type && asset.type !== 'image') throw new PhotoError('Only photos can be added, not videos.');
  const mime = photoMimeType(asset.mimeType, asset.fileName ?? asset.uri) ?? (asset.mimeType ? null : 'image/jpeg');
  if (!mime) throw new PhotoError('That file type isn’t supported. Choose a JPEG, PNG, WebP or HEIC photo.');
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_PHOTO_BYTES) {
    throw new PhotoError('That photo is over 10 MB. Choose a smaller one.');
  }
  return mime;
}

