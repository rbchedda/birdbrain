import { reencodePhotoForUpload } from '@/lib/reencodePhotoForUpload';
import { jpegHasExifSegment, jpegHasGpsExif } from '@/lib/stripJpegMetadata';

import { buildGpsJpeg } from './fixtures/gpsJpeg';

const originalUri = 'file:///tmp/original-gps.jpg';
const savedUri = 'file:///tmp/reencoded.jpg';

const saveAsync = jest.fn(async () => ({ uri: savedUri }));
const renderAsync = jest.fn(async () => ({ saveAsync }));
const mockManipulate = jest.fn((_uri: string) => ({ renderAsync }));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulate: (...args: unknown[]) => (mockManipulate as Function)(...args),
  ImageManipulator: { manipulate: (...args: unknown[]) => (mockManipulate as Function)(...args) },
}));

describe('reencodePhotoForUpload', () => {
  const tagged = buildGpsJpeg();
  const fetchMock = jest.fn();

  beforeEach(() => {
    mockManipulate.mockClear();
    renderAsync.mockClear();
    saveAsync.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (uri: string) => {
      if (uri === savedUri) {
        return { ok: true, arrayBuffer: async () => tagged.buffer.slice(tagged.byteOffset, tagged.byteOffset + tagged.byteLength) };
      }
      throw new Error(`unexpected fetch of ${uri} — must read the re-encoded file only`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('re-encodes through the manipulator and returns bytes with no GPS or EXIF', async () => {
    expect(jpegHasGpsExif(tagged)).toBe(true);
    const cleaned = await reencodePhotoForUpload(originalUri);
    expect(mockManipulate).toHaveBeenCalledWith(originalUri);
    expect(fetchMock).toHaveBeenCalledWith(savedUri);
    expect(fetchMock).not.toHaveBeenCalledWith(originalUri);
    expect(cleaned[0]).toBe(0xff);
    expect(cleaned[1]).toBe(0xd8);
    expect(jpegHasGpsExif(cleaned)).toBe(false);
    expect(jpegHasExifSegment(cleaned)).toBe(false);
  });

  it('does not upload when the manipulator yields a non-JPEG', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    }));
    await expect(reencodePhotoForUpload(originalUri)).rejects.toThrow(/not a JPEG/);
  });
});
