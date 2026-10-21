import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseBackend } from '@/data/supabaseBackend';
import { LIST_PAGE, REMOVE_BATCH, listAllFiles, removeAllUnder, type StorageBucketApi } from '@/lib/storageCleanup';

const uid = '00000000-0000-4000-8000-00000000000a';

/** In-memory Storage bucket with supabase-js list semantics: one level, folders have id null, limit/offset paging. */
function fakeBucket(paths: string[], fail: { list?: string; removeAfter?: number } = {}) {
  const files = new Set(paths);
  const calls = { list: [] as { dir: string; offset: number }[], remove: [] as string[][] };
  let removes = 0;
  const bucket: StorageBucketApi = {
    async list(dir, { limit, offset }) {
      calls.list.push({ dir, offset });
      if (fail.list && dir === fail.list) return { data: null, error: { message: 'list failed' } };
      const level = new Map<string, boolean>();
      for (const f of [...files].sort()) {
        if (!f.startsWith(`${dir}/`)) continue;
        const rest = f.slice(dir.length + 1);
        const [head, ...tail] = rest.split('/');
        level.set(head, level.get(head) || tail.length > 0);
      }
      const items = [...level.entries()].map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` }));
      return { data: items.slice(offset, offset + limit), error: null };
    },
    async remove(batch) {
      calls.remove.push(batch);
      if (fail.removeAfter !== undefined && removes++ >= fail.removeAfter) return { data: null, error: { message: 'remove failed' } };
      batch.forEach((p) => files.delete(p));
      return { data: batch, error: null };
    },
  };
  return { bucket, files, calls };
}

const nested = [
  `${uid}/avatar.jpg`,
  `${uid}/entry-1/p1.jpg`,
  `${uid}/entry-1/p2.jpg`,
  `${uid}/entry-2/deep/er/p3.jpg`,
  `other-user/entry-9/p9.jpg`,
];

describe('recursive storage cleanup', () => {
  it('lists nested files under a prefix only', async () => {
    const { bucket } = fakeBucket(nested);
    expect((await listAllFiles(bucket, uid)).sort()).toEqual(nested.filter((p) => p.startsWith(uid)).sort());
  });

  it('paginates large folders and removes in batches', async () => {
    const many = Array.from({ length: LIST_PAGE * 2 + 37 }, (_, i) => `${uid}/entry-x/p${String(i).padStart(4, '0')}.jpg`);
    const { bucket, files, calls } = fakeBucket([...many, 'other-user/a.jpg']);
    expect(await removeAllUnder(bucket, uid)).toBe(many.length);
    expect(calls.list.filter((c) => c.dir === `${uid}/entry-x`).map((c) => c.offset)).toEqual([0, LIST_PAGE, LIST_PAGE * 2]);
    expect(calls.remove.every((b) => b.length <= REMOVE_BATCH)).toBe(true);
    expect([...files]).toEqual(['other-user/a.jpg']);
  });

  it('is a no-op for an empty folder', async () => {
    const { bucket, calls } = fakeBucket([]);
    expect(await removeAllUnder(bucket, uid)).toBe(0);
    expect(calls.remove).toEqual([]);
  });

  it('throws on a list failure before removing anything', async () => {
    const { bucket, calls } = fakeBucket(nested, { list: `${uid}/entry-2` });
    await expect(removeAllUnder(bucket, uid)).rejects.toThrow(/list failed/);
    expect(calls.remove).toEqual([]);
  });

  it('throws on a remove failure', async () => {
    const many = Array.from({ length: REMOVE_BATCH + 5 }, (_, i) => `${uid}/e/p${i}.jpg`);
    const { bucket } = fakeBucket(many, { removeAfter: 1 });
    await expect(removeAllUnder(bucket, uid)).rejects.toThrow(/remove failed/);
  });
});

function fakeSupabase(buckets: Record<string, ReturnType<typeof fakeBucket>>) {
  const rpc = jest.fn(async () => ({ data: null, error: null }));
  const deletes: unknown[] = [];
  const sb = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: uid } } } }),
      signOut: jest.fn(async () => ({ error: null })),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: (name: string) => buckets[name].bucket },
    rpc,
    from: (table: string) => ({ delete: () => ({ eq: async (col: string, v: unknown) => (deletes.push([table, col, v]), { data: null, error: null }) }) }),
  } as unknown as SupabaseClient;
  return { sb, rpc, deletes };
}

describe('supabase deleteAccount', () => {
  it('removes every nested post and diary photo for the user, then deletes the account', async () => {
    const post = fakeBucket([`${uid}/a.jpg`, `${uid}/2026/b.jpg`, 'other-user/c.jpg']);
    const diary = fakeBucket(nested);
    const { sb, rpc } = fakeSupabase({ 'post-photos': post, 'diary-photos': diary });
    await createSupabaseBackend(sb).deleteAccount();
    expect([...post.files]).toEqual(['other-user/c.jpg']);
    expect([...diary.files]).toEqual(['other-user/entry-9/p9.jpg']);
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
  });

  it('keeps the account when photo removal fails', async () => {
    const diary = fakeBucket(nested, { removeAfter: 0 });
    const { sb, rpc } = fakeSupabase({ 'post-photos': fakeBucket([]), 'diary-photos': diary });
    await expect(createSupabaseBackend(sb).deleteAccount()).rejects.toThrow(/remove failed/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('supabase deleteHuntLogEntry', () => {
  it('removes the entry’s nested photos, then the row', async () => {
    const diary = fakeBucket([`${uid}/entry-1/p1.jpg`, `${uid}/entry-1/thumbs/p1.jpg`, `${uid}/entry-2/p2.jpg`]);
    const { sb, deletes } = fakeSupabase({ 'diary-photos': diary });
    await createSupabaseBackend(sb).deleteHuntLogEntry('entry-1');
    expect([...diary.files]).toEqual([`${uid}/entry-2/p2.jpg`]);
    expect(deletes).toEqual([['hunt_log_entries', 'client_id', 'entry-1']]);
  });

  it('keeps the row (tombstone retries) when photo removal fails', async () => {
    const diary = fakeBucket([`${uid}/entry-1/p1.jpg`], { list: `${uid}/entry-1` });
    const { sb, deletes } = fakeSupabase({ 'diary-photos': diary });
    await expect(createSupabaseBackend(sb).deleteHuntLogEntry('entry-1')).rejects.toThrow(/list failed/);
    expect(deletes).toEqual([]);
  });
});
