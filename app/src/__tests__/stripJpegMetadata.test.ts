import { jpegHasExifSegment, jpegHasGpsExif, stripJpegMetadata } from '@/lib/stripJpegMetadata';

import { buildGpsJpeg } from './fixtures/gpsJpeg';

describe('stripJpegMetadata (client EXIF strip)', () => {
  it('removes GPS EXIF from a tagged JPEG', () => {
    const tagged = buildGpsJpeg();
    expect(jpegHasGpsExif(tagged)).toBe(true);
    expect(jpegHasExifSegment(tagged)).toBe(true);
    const cleaned = stripJpegMetadata(tagged);
    expect(cleaned[0]).toBe(0xff);
    expect(cleaned[1]).toBe(0xd8);
    expect(jpegHasGpsExif(cleaned)).toBe(false);
    expect(jpegHasExifSegment(cleaned)).toBe(false);
  });

  it('rejects non-JPEG input', () => {
    expect(() => stripJpegMetadata(Uint8Array.from([0x00, 0x01]))).toThrow(/not a JPEG/);
  });
});
