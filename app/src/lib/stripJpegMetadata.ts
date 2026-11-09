/**
 * Strip JPEG metadata segments (EXIF / APP1, XMP, ICC APP2, IPTC APP13, comments)
 * by keeping only SOF/DHT/DQT/SOS/… image segments. Pure JS; no native modules.
 * Keep in sync with supabase/functions/strip-diary-photo/stripJpegMetadata.mjs.
 */
const KEEP = new Set([
  0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc9, 0xffca, 0xffcb,
  0xffcd, 0xffce, 0xffcf, // SOF
  0xffc4, // DHT
  0xffdb, // DQT
  0xffdd, // DRI
  0xffda, // SOS
]);

export function stripJpegMetadata(input: Uint8Array | ArrayBuffer): Uint8Array {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('not a JPEG');
  }
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      for (; i < buf.length; i++) out.push(buf[i]);
      break;
    }
    while (i < buf.length && buf[i] === 0xff) i++;
    if (i >= buf.length) break;
    const marker = 0xff00 | buf[i];
    i++;
    if (marker === 0xffd9) {
      out.push(0xff, 0xd9);
      break;
    }
    if (marker === 0xffda) {
      if (i + 1 >= buf.length) throw new Error('truncated SOS');
      const len = (buf[i] << 8) | buf[i + 1];
      out.push(0xff, 0xda);
      for (let k = 0; k < len && i + k < buf.length; k++) out.push(buf[i + k]);
      i += len;
      for (; i < buf.length; i++) out.push(buf[i]);
      break;
    }
    if (
      marker === 0xffd0 ||
      marker === 0xffd1 ||
      marker === 0xffd2 ||
      marker === 0xffd3 ||
      marker === 0xffd4 ||
      marker === 0xffd5 ||
      marker === 0xffd6 ||
      marker === 0xffd7 ||
      marker === 0xff01
    ) {
      out.push(0xff, marker & 0xff);
      continue;
    }
    if (i + 1 >= buf.length) throw new Error('truncated segment');
    const len = (buf[i] << 8) | buf[i + 1];
    if (KEEP.has(marker)) {
      out.push(0xff, marker & 0xff);
      for (let k = 0; k < len && i + k < buf.length; k++) out.push(buf[i + k]);
    }
    i += len;
  }
  return Uint8Array.from(out);
}

/** True if buffer contains an EXIF APP1 with a GPS IFD pointer (tag 0x8825). */
export function jpegHasGpsExif(input: Uint8Array | ArrayBuffer): boolean {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  let i = 2;
  while (i + 4 < buf.length && buf[i] === 0xff) {
    while (i < buf.length && buf[i] === 0xff) i++;
    if (i >= buf.length) break;
    const marker = 0xff00 | buf[i++];
    if (marker === 0xffda || marker === 0xffd9) break;
    if (i + 1 >= buf.length) break;
    const len = (buf[i] << 8) | buf[i + 1];
    if (marker === 0xffe1 && len > 8) {
      const start = i + 2;
      const head = String.fromCharCode(buf[start], buf[start + 1], buf[start + 2], buf[start + 3]);
      if (head === 'Exif') {
        for (let j = start; j < start + len - 2 && j + 1 < buf.length; j++) {
          if (buf[j] === 0x88 && buf[j + 1] === 0x25) return true;
          if (buf[j] === 0x25 && buf[j + 1] === 0x88) return true;
        }
      }
    }
    i += len;
  }
  return false;
}

export function jpegHasExifSegment(input: Uint8Array | ArrayBuffer): boolean {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const asStr = Array.from(buf, (b) => String.fromCharCode(b)).join('');
  return asStr.includes('Exif');
}
