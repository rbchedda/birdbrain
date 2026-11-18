import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';
import type { PostDraft } from '@/data/types';

const uid = '00000000-0000-4000-8000-00000000000a';
const localUri = 'file:///docs/photos/p1.jpg';

type Call = { table: string; op: string; args: unknown[] };

/** Minimal chainable PostgREST + Storage fake that records what the backend does. */
function fakeSupabase(opts: { failPostInsert?: boolean; failCounts?: boolean; existingPhotoPath?: string | null } = {}) {
  const calls: Call[] = [];
  const uploads: { bucket: string; path: string; contentType?: string; bytes: number }[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  const signed: { bucket: string; path: string }[] = [];
  const invokes: unknown[] = [];
  const order: string[] = [];
  let inserted: Record<string, unknown> | null = null;

  const postRow = () => ({
    id: 'post-1',
    author_id: uid,
    kind: 'hunt',
    species: 'pheasant',
    caption: 'Ruby',
    created_at: '2026-11-17T12:00:00Z',
    public_after: '2026-11-18T12:00:00Z',
    hunted_on: '2026-11-17',
    location_visibility: 'hidden',
    public_geom: null,
    counts: null,
    photo_path: inserted?.photo_path ?? null,
    author: { id: uid, username: 'me', display_name: 'Me' },
    group: null,
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  });

  const from = (table: string) => {
    let op = 'select';
    const q: Record<string, unknown> = {};
    const result = () => {
      if (table === 'posts' && op === 'insert') {
        return opts.failPostInsert ? { data: null, error: { message: 'insert refused' } } : { data: { id: 'post-1' }, error: null };
      }
      if (table === 'post_place_counts' && op === 'insert' && opts.failCounts) return { data: null, error: { message: 'counts refused' } };
      if (table === 'posts' && op === 'select') {
        return { data: opts.existingPhotoPath !== undefined ? { photo_path: opts.existingPhotoPath } : postRow(), error: null };
      }
      return { data: [], error: null };
    };
    const chain = (name: string) => (...args: unknown[]) => {
      calls.push({ table, op: name, args });
      if (name === 'insert') {
        op = 'insert';
        if (table === 'posts') inserted = args[0] as Record<string, unknown>;
        order.push(`insert:${table}`);
      }
      if (name === 'delete') op = 'delete';
      return q;
    };
    for (const n of ['select', 'insert', 'delete', 'eq', 'in', 'order', 'limit', 'lt', 'upsert']) q[n] = chain(n);
    q.single = async () => result();
    q.maybeSingle = async () => result();
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return q;
  };

  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: uid, is_anonymous: false } } } }) },
    from,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: ArrayBuffer, o?: { contentType?: string }) => {
          uploads.push({ bucket, path, contentType: o?.contentType, bytes: body.byteLength });
          order.push(`upload:${bucket}`);
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { data: [], error: null };
        },
        createSignedUrl: async (path: string) => {
          signed.push({ bucket, path });
          return path.includes('denied') ? { data: null, error: { message: 'Object not found' } } : { data: { signedUrl: `https://signed/${path}` }, error: null };
        },
      }),
    },
    functions: { invoke: jest.fn(async (...a: unknown[]) => invokes.push(a)) },
  } as unknown as SupabaseClient;

  return { sb, calls, uploads, removed, signed, invokes, order, inserted: () => inserted };
}

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
  species: 'pheasant',
  caption: 'Ruby',
  huntedOn: '2026-11-17',
  counts: [],
  exact: null,
  location: 'hidden',
  audience: 'shared',
  groupSlug: null,
  photo: { id: 'p1', localUri, mimeType: 'image/jpeg' },
  ...over,
});

beforeEach(() => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 0xff, 0xd9]);
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    // React Native's file:// fetch reports no content type.
    headers: { get: () => null },
    arrayBuffer: async () => bytes.buffer.slice(0),
  })) as unknown as typeof fetch;
});

describe('post photos (posts.photo_path)', () => {
  it('uploads the original bytes to post-photos/<uid>/ first, then inserts the post with photo_path', async () => {
    const f = fakeSupabase();
    const post = await createSupabaseBackend(f.sb).createPost(draft());
    expect(f.uploads).toEqual([{ bucket: 'post-photos', path: `${uid}/p1.jpg`, contentType: 'image/jpeg', bytes: 9 }]);
    expect(f.inserted()).toMatchObject({ author_id: uid, photo_path: `${uid}/p1.jpg` });
    // Upload before insert: photo_path is set on insert, never by a later edit (which would restart the delay).
    expect(f.order.slice(0, 2)).toEqual(['upload:post-photos', 'insert:posts']);
    expect(post.photoPath).toBe(`${uid}/p1.jpg`);
    expect(f.invokes).toEqual([]);
  });

  it('uses the picked type for the extension and content type', async () => {
    const f = fakeSupabase();
    await createSupabaseBackend(f.sb).createPost(draft({ photo: { id: 'p2', localUri: 'file:///x.png', mimeType: 'image/png' } }));
    expect(f.uploads[0]).toMatchObject({ path: `${uid}/p2.png`, contentType: 'image/png' });
  });

  it('a post without a photo uploads nothing and sets photo_path null', async () => {
    const f = fakeSupabase();
    const post = await createSupabaseBackend(f.sb).createPost(draft({ photo: null }));
    expect(f.uploads).toEqual([]);
    expect(f.inserted()).toMatchObject({ photo_path: null });
    expect(post.photoPath).toBeNull();
  });

  it('removes the uploaded photo when the post insert fails', async () => {
    const f = fakeSupabase({ failPostInsert: true });
    await expect(createSupabaseBackend(f.sb).createPost(draft())).rejects.toThrow('insert refused');
    expect(f.removed).toEqual([{ bucket: 'post-photos', paths: [`${uid}/p1.jpg`] }]);
  });

  it('removes the photo with the half-made post when a later step fails', async () => {
    const f = fakeSupabase({ failCounts: true });
    const d = draft({ counts: [{ placeId: 'x', placeName: 'X', flushed: 1, roosters: 0, harvested: 0 }] });
    await expect(createSupabaseBackend(f.sb).createPost(d)).rejects.toThrow('counts refused');
    expect(f.calls.some((c) => c.table === 'posts' && c.op === 'delete')).toBe(true);
    expect(f.removed).toEqual([{ bucket: 'post-photos', paths: [`${uid}/p1.jpg`] }]);
  });

  it('deleting a post also removes its photo from the owner folder', async () => {
    const f = fakeSupabase({ existingPhotoPath: `${uid}/p1.jpg` });
    await createSupabaseBackend(f.sb).deletePost('post-1');
    expect(f.removed).toEqual([{ bucket: 'post-photos', paths: [`${uid}/p1.jpg`] }]);
  });

  it('deleting a post with no photo touches no storage', async () => {
    const f = fakeSupabase({ existingPhotoPath: null });
    await createSupabaseBackend(f.sb).deletePost('post-1');
    expect(f.removed).toEqual([]);
  });

  it('photoUrl returns a signed URL, or null when RLS (delay, blocks, owner-only diary) denies it', async () => {
    const f = fakeSupabase();
    const api = createSupabaseBackend(f.sb);
    expect(await api.photoUrl('post-photos', `${uid}/p1.jpg`)).toBe(`https://signed/${uid}/p1.jpg`);
    expect(await api.photoUrl('post-photos', 'other/denied.jpg')).toBeNull();
    expect(await api.photoUrl('diary-photos', `${uid}/e1/p1.jpg`)).toBe(`https://signed/${uid}/e1/p1.jpg`);
    expect(f.signed.map((s) => s.bucket)).toEqual(['post-photos', 'post-photos', 'diary-photos']);
  });

  it('diary uploads keep the picked type', async () => {
    const f = fakeSupabase();
    const path = await createSupabaseBackend(f.sb).uploadDiaryPhoto('e1', { id: 'p3', localUri: 'file:///x.heic', mimeType: 'image/heic' });
    expect(path).toBe(`${uid}/e1/p3.heic`);
    expect(f.uploads[0]).toMatchObject({ bucket: 'diary-photos', contentType: 'image/heic' });
  });
});
