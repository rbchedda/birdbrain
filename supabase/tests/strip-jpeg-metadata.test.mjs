import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jpegHasGpsExif, stripJpegMetadata } from '../functions/strip-diary-photo/stripJpegMetadata.mjs';
import { buildGpsJpeg } from './gpsJpegFixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures');
mkdirSync(fixtureDir, { recursive: true });

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
