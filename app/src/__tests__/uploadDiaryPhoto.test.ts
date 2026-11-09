import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';
import { PHOTO_ADD_UPDATE_APP_MESSAGE } from '@/lib/reencodePhotoForUpload';
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

function fakeSb(invokes: { name: string; args: { headers?: Record<string, string>; body?: ArrayBuffer | Uint8Array } }[]) {
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
      from: () => ({
        upload: async () => {
          throw new Error('clients must not storage.upload photo buckets');
        },
      }),
    },
    functions: {
      invoke: jest.fn(async (name: string, args: { headers?: Record<string, string>; body?: ArrayBuffer | Uint8Array }) => {
        invokes.push({ name, args });
        return { data: { ok: true }, error: null };
      }),
    },
  } as unknown as SupabaseClient;
  return sb;
}

describe('uploadDiaryPhoto goes through strip-diary-photo', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
  });

  it('re-encodes first, invokes the function with cleaned JPEG bytes, and never storage.uploads', async () => {
    delete process.env.EXPO_PUBLIC_FLAG_PHOTO_STRIP_LIVE;
    const invokes: { name: string; args: { headers?: Record<string, string>; body?: ArrayBuffer | Uint8Array } }[] = [];
    const sb = fakeSb(invokes);
    const path = await createSupabaseBackend(sb).uploadDiaryPhoto('entry-1', { id: 'p1', localUri: originalUri });
    expect(path).toBe(`${uid}/entry-1/p1.jpg`);
    expect(invokes).toHaveLength(1);
    expect(invokes[0].name).toBe('strip-diary-photo');
    expect(invokes[0].args.headers?.['x-birdbrain-bucket']).toBe('diary-photos');
    expect(invokes[0].args.headers?.['x-birdbrain-path']).toBe(path);
    expect(invokes[0].args.headers?.['content-type']).toBe('image/jpeg');
    const raw = invokes[0].args.body!;
    const body = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    expect(jpegHasGpsExif(body)).toBe(false);
    expect(jpegHasExifSegment(body)).toBe(false);
    expect(mockManipulate).toHaveBeenCalledWith(originalUri);
  });
});

describe('uploadDiaryPhoto fail-closed when the native module is missing', () => {
  it('throws the friendly update-app error and never uploads raw bytes', async () => {
    jest.resetModules();
    jest.doMock('@/lib/photoManipulatorNative', () => ({
      getExpoImageManipulatorNative: () => null,
    }));
    const invokes: unknown[] = [];
    const uploads: unknown[] = [];
    const { createSupabaseBackend: createFresh } = require('@/data/supabaseBackend') as typeof import('@/data/supabaseBackend');
    const { PHOTO_ADD_UPDATE_APP_MESSAGE: msg } = require('@/lib/reencodePhotoForUpload') as typeof import('@/lib/reencodePhotoForUpload');
    expect(msg).toBe(PHOTO_ADD_UPDATE_APP_MESSAGE);

    const sb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: uid, is_anonymous: false } } } }) },
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            uploads.push(args);
            return { data: { path: 'leaked' }, error: null };
          },
        }),
      },
      functions: {
        invoke: jest.fn(async (...args: unknown[]) => {
          invokes.push(args);
          return { data: { ok: true }, error: null };
        }),
      },
    } as unknown as SupabaseClient;

    await expect(createFresh(sb).uploadDiaryPhoto('entry-1', { id: 'p1', localUri: originalUri })).rejects.toThrow(
      PHOTO_ADD_UPDATE_APP_MESSAGE,
    );
    expect(uploads).toEqual([]);
    expect(invokes).toEqual([]);
  });
});
