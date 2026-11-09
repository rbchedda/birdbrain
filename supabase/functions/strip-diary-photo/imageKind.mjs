/**
 * Detect a photo's container and turn a JPEG into a metadata-free JPEG.
 * PNG, WebP and HEIC/HEIF cannot be re-encoded in the Deno edge runtime
 * (no native decoder, and HEIC especially has no feasible pure-JS path here),
 * so they are rejected and never written.
 */
import { stripJpegMetadata } from './stripJpegMetadata.mjs';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export class UnsupportedImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedImageError';
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {'jpeg' | 'png' | 'webp' | 'heic' | 'avif' | 'unknown'}
 */
export function detectImageKind(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp';
  }
  if (buf.length >= 12) {
    const brandBox = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
    if (brandBox === 'ftyp') {
      const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
      if (brand === 'avif' || brand === 'avis') return 'avif';
      if (['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc', 'hev1'].includes(brand)) return 'heic';
    }
  }
  return 'unknown';
}

/**
 * Return a cleaned JPEG, or throw UnsupportedImageError. Never returns the raw input.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function toCleanJpeg(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const kind = detectImageKind(buf);
  if (kind === 'jpeg') return stripJpegMetadata(buf);
  if (kind === 'png' || kind === 'webp' || kind === 'heic' || kind === 'avif') {
    throw new UnsupportedImageError(
      `${kind.toUpperCase()} is not accepted; only a cleaned JPEG can be stored`,
    );
  }
  throw new UnsupportedImageError('only a cleaned JPEG can be stored');
}
