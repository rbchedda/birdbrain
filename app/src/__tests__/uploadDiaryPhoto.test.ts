import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';
import { jpegHasExifSegment, jpegHasGpsExif } from '@/lib/stripJpegMetadata';

import { buildGpsJpeg } from './fixtures/gpsJpeg';

const uid = '00000000-0000-4000-8000-00000000000a';
const originalUri = 'file:///tmp/original-gps.jpg';
const savedUri = 'file:///tmp/reencoded.jpg';
const mockManipulate = jest.fn((_uri: string) => ({
  renderAsync: async () => ({ saveAsync: async () => ({ uri: savedUri }) }),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulate: (...args: unknown[]) => (mockManipulate as Function)(...args),
  ImageManipulator: { manipulate: (...args: unknown[]) => (mockManipulate as Function)(...args) },
}));

function fakeSb(uploads: { bucket: string; path: string; body: ArrayBuffer | Uint8Array; contentType?: string }[], invokes: unknown[]) {
  const tagged = buildGpsJpeg();
  globalThis.fetch = jest.fn(async (uri: string) => {
    if (uri !== savedUri) throw new Error(`unexpected fetch of ${uri}`);
    return {
      ok: true,
      arrayBuffer: async () => tagged.buffer.slice(tagged.byteOffset, tagged.byteOffset + tagged.byteLength),
    };
  }) as unknown as typeof fetch;

  const sb = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: uid, is_anonymous: false } } } }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: ArrayBuffer | Uint8Array, opts?: { contentType?: string }) => {
          uploads.push({ bucket, path, body, contentType: opts?.contentType });
          return { data: { path }, error: null };
        },
      }),
    },
    functions: {
      invoke: jest.fn(async (name: string, args: unknown) => {
        invokes.push({ name, args });
        return { data: { ok: true }, error: null };
      }),
    },
  } as unknown as SupabaseClient;
  return sb;
}

describe('uploadDiaryPhoto strips EXIF before upload', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
    jest.resetModules();
  });

  it('uploads only re-encoded bytes with no GPS or EXIF, and does not call the edge function while the flag is off', async () => {
    delete process.env.EXPO_PUBLIC_FLAG_PHOTO_STRIP_LIVE;
    const uploads: { bucket: string; path: string; body: ArrayBuffer | Uint8Array; contentType?: string }[] = [];
    const invokes: unknown[] = [];
    const sb = fakeSb(uploads, invokes);
    const path = await createSupabaseBackend(sb).uploadDiaryPhoto('entry-1', { id: 'p1', localUri: originalUri });
    expect(path).toBe(`${uid}/entry-1/p1.jpg`);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe('diary-photos');
    expect(uploads[0].path).toBe(path);
    expect(uploads[0].contentType).toBe('image/jpeg');
    const body = uploads[0].body instanceof Uint8Array ? uploads[0].body : new Uint8Array(uploads[0].body);
    expect(jpegHasGpsExif(body)).toBe(false);
    expect(jpegHasExifSegment(body)).toBe(false);
    expect(invokes).toEqual([]);
    expect(mockManipulate).toHaveBeenCalledWith(originalUri);
  });

  it('invokes strip-diary-photo after upload when the live flag is on', async () => {
    process.env.EXPO_PUBLIC_FLAG_PHOTO_STRIP_LIVE = '1';
    jest.resetModules();
    const { createSupabaseBackend: createFresh } = require('@/data/supabaseBackend') as typeof import('@/data/supabaseBackend');
    const uploads: { bucket: string; path: string; body: ArrayBuffer | Uint8Array }[] = [];
    const invokes: unknown[] = [];
    const sb = fakeSb(uploads, invokes);
    const path = await createFresh(sb).uploadDiaryPhoto('entry-1', { id: 'p1', localUri: originalUri });
    expect(invokes).toEqual([{ name: 'strip-diary-photo', args: { body: { bucket: 'diary-photos', path } } }]);
    const body = uploads[0].body instanceof Uint8Array ? uploads[0].body : new Uint8Array(uploads[0].body);
    expect(jpegHasGpsExif(body)).toBe(false);
  });
});
