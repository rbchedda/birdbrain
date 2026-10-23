import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';

import { createTestDb } from '../supabase/tests/db.mjs';
import { runCleanup, storageClient } from './storage_cleanup.mjs';

let db;
before(async () => { db = await createTestDb(); });
beforeEach(async () => { await db.query('delete from public.storage_deletion_queue'); });

const enqueue = (bucket, ...paths) =>
  Promise.all(paths.map((p) => db.query(`insert into public.storage_deletion_queue (bucket_id, path, reason) values ($1, $2, 'test')`, [bucket, p])));
const queue = async () => (await db.query('select bucket_id, path, attempts, last_error from public.storage_deletion_queue order by id')).rows;
const mockStorage = (fail = () => false) => {
  const calls = [];
  return { calls, async remove(bucket, paths) { calls.push([bucket, paths]); if (fail(bucket, paths)) throw new Error(`boom ${bucket}`); return paths.map((name) => ({ name })); } };
};

test('deletes via the Storage client, batched per bucket, and removes rows on success', async () => {
  await enqueue('post-photos', 'a/1.jpg', 'a/2.jpg', 'a/3.jpg');
  await enqueue('diary-photos', 'a/d.jpg');
  const s = mockStorage();
  assert.deepEqual(await runCleanup(db, s, { batchSize: 2 }), { deleted: 4, failed: 0, stuck: 0 });
  assert.deepEqual(await queue(), []);
  assert.deepEqual(s.calls.flatMap(([b, p]) => p.map((x) => `${b}:${x}`)).sort(), ['diary-photos:a/d.jpg', 'post-photos:a/1.jpg', 'post-photos:a/2.jpg', 'post-photos:a/3.jpg']);
  assert.ok(s.calls.every(([, p]) => p.length <= 2));
});

test('keeps rows on failure with attempts and last_error, and retries on a later run', async () => {
  await enqueue('post-photos', 'b/1.jpg');
  await enqueue('diary-photos', 'b/d.jpg');
  const r = await runCleanup(db, mockStorage((b) => b === 'post-photos'));
  assert.deepEqual(r, { deleted: 1, failed: 1, stuck: 0 });
  assert.deepEqual(await queue(), [{ bucket_id: 'post-photos', path: 'b/1.jpg', attempts: 1, last_error: 'boom post-photos' }]);
  // Same run window: backoff skips it.
  assert.deepEqual(await runCleanup(db, mockStorage()), { deleted: 0, failed: 0, stuck: 0 });
  await db.query(`update public.storage_deletion_queue set last_attempt_at = now() - interval '2 minutes'`);
  assert.deepEqual(await runCleanup(db, mockStorage()), { deleted: 1, failed: 0, stuck: 0 });
  assert.deepEqual(await queue(), []);
});

test('rows that hit max attempts are left and reported as stuck', async () => {
  await enqueue('post-photos', 'c/1.jpg');
  await db.query('update public.storage_deletion_queue set attempts = 3');
  const s = mockStorage();
  assert.deepEqual(await runCleanup(db, s, { maxAttempts: 3 }), { deleted: 0, failed: 0, stuck: 1 });
  assert.equal(s.calls.length, 0);
});

test('storageClient calls the Storage API remove endpoint with the service key', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return new Response('[{"name":"x/1.jpg"}]', { status: 200 }); };
  await storageClient({ url: 'https://ref.supabase.co/', serviceKey: 'svc', fetchImpl }).remove('post-photos', ['x/1.jpg']);
  assert.equal(seen[0].url, 'https://ref.supabase.co/storage/v1/object/post-photos');
  assert.equal(seen[0].init.method, 'DELETE');
  assert.equal(seen[0].init.headers.authorization, 'Bearer svc');
  assert.deepEqual(JSON.parse(seen[0].init.body), { prefixes: ['x/1.jpg'] });
  const bad = storageClient({ url: 'https://ref.supabase.co', serviceKey: 'svc', fetchImpl: async () => new Response('nope', { status: 403 }) });
  await assert.rejects(bad.remove('post-photos', ['x']), /storage 403: nope/);
});
