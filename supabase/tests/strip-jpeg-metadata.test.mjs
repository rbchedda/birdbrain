import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jpegHasGpsExif, stripJpegMetadata } from '../functions/strip-diary-photo/stripJpegMetadata.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures');
mkdirSync(fixtureDir, { recursive: true });

/** Minimal 1×1 JPEG (JFIF) then inject a fake EXIF APP1 with GPS IFD tag bytes. */
function buildGpsJpeg() {
  // Tiny valid JPEG (1x1 grey) — SOF0/DQT/DHT/SOS/EOI
  const base = Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0 JFIF
    0xff, 0xdb, 0x00, 0x43, 0x00,
    ...Array(64).fill(1),
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
  ]);
  // Craft APP1 Exif with GPS tag 0x8825 somewhere in the payload.
  const exifBody = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, // TIFF big-endian
    0x00, 0x00, 0x00, 0x08,
    0x00, 0x01, // 1 IFD entry
    0x88, 0x25, // GPS IFD tag
    0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  ];
  const app1Len = exifBody.length + 2;
  const app1 = [0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...exifBody];
  // Insert APP1 after SOI
  const out = new Uint8Array(2 + app1.length + (base.length - 2));
  out.set(base.subarray(0, 2), 0);
  out.set(Uint8Array.from(app1), 2);
  out.set(base.subarray(2), 2 + app1.length);
  return out;
}

describe('stripJpegMetadata (server EXIF strip)', () => {
  it('removes GPS EXIF from a tagged JPEG', () => {
    const tagged = buildGpsJpeg();
    const fixturePath = join(fixtureDir, 'gps-tagged.jpg');
    writeFileSync(fixturePath, tagged);
    assert.equal(jpegHasGpsExif(tagged), true, 'fixture should contain GPS IFD tag');
    const cleaned = stripJpegMetadata(tagged);
    assert.equal(cleaned[0], 0xff);
    assert.equal(cleaned[1], 0xd8);
    assert.equal(jpegHasGpsExif(cleaned), false, 'stripped output must not contain GPS EXIF');
    // No APP1 Exif left
    const asStr = Buffer.from(cleaned).toString('binary');
    assert.equal(asStr.includes('Exif'), false);
    writeFileSync(join(fixtureDir, 'gps-stripped.jpg'), cleaned);
  });

  it('rejects non-JPEG input', () => {
    assert.throws(() => stripJpegMetadata(Uint8Array.from([0x00, 0x01])), /not a JPEG/);
  });
});
