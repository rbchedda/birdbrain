import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';

import { buildGpsJpeg } from './fixtures/gpsJpeg';

const uid = '00000000-0000-4000-8000-00000000000a';
const originalUri = 'file:///tmp/original-gps.jpg';

describe('uploadDiaryPhoto uses direct storage.upload', () => {
  it('uploads the original bytes to the owner folder and does not invoke strip-diary-photo', async () => {
    const tagged = buildGpsJpeg();
    const uploads: { bucket: string; path: string; body: ArrayBuffer; options?: { contentType?: string } }[] = [];
    const invokes: unknown[] = [];
    globalThis.fetch = jest.fn(async (uri: string) => {
      if (uri !== originalUri) throw new Error(`unexpected fetch of ${uri}`);
      return {
        ok: true,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
        arrayBuffer: async () => tagged.buffer.slice(tagged.byteOffset, tagged.byteOffset + tagged.byteLength),
      };
    }) as unknown as typeof fetch;

    const sb = {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: uid, is_anonymous: false } } } }),
      },
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, body: ArrayBuffer, options?: { contentType?: string }) => {
            uploads.push({ bucket, path, body, options });
            return { data: { path }, error: null };
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

    const path = await createSupabaseBackend(sb).uploadDiaryPhoto('entry-1', { id: 'p1', localUri: originalUri });
    expect(path).toBe(`${uid}/entry-1/p1.jpg`);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe('diary-photos');
    expect(uploads[0].path).toBe(path);
    expect(uploads[0].options?.contentType).toBe('image/jpeg');
    expect(invokes).toEqual([]);
  });
});
