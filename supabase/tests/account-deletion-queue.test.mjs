import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const carol = '00000000-0000-4000-8000-0000000000c3';
const dan = '00000000-0000-4000-8000-0000000000d3';
const erin = '00000000-0000-4000-8000-0000000000e3';

let db;
const n = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);
const queued = async (u) =>
  (await db.query(`select bucket_id, path, reason, attempts from public.storage_deletion_queue where path like $1 or path like 'shared/%' order by bucket_id, path`, [`${u}/%`])).rows;
const obj = (bucket, name, owner = null) => db.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [bucket, name, owner]);
const del = (u) => as(db, 'authenticated', u, (tx) => tx.query('select public.delete_my_account()'));
const reads = (role, u, name) => as(db, role, u, (tx) => tx.query('select 1 from storage.objects where name = $1', [name])).then((r) => r.rows.length);

before(async () => {
  db = await createTestDb();
  for (const [u, e] of [[carol, 'c3'], [dan, 'd3'], [erin, 'e3']]) await createUser(db, u, `${e}@example.test`);
});

describe('delete_my_account queues storage instead of deleting it', () => {
  it("queues every object the user owns, in every bucket, and nobody else's", async () => {
    // A visible public post with a photo, so dan can read it beforehand.
    await db.query(`insert into public.posts (author_id, species, photo_path, public_after) values ($1, 'pheasant', $2, now() - interval '1 day')`, [carol, `${carol}/post.jpg`]);
    await obj('post-photos', `${carol}/post.jpg`, carol);
    await obj('post-photos', `${carol}/orphan.jpg`); // in their folder, no owner set
    await obj('diary-photos', `${carol}/d/1.jpg`, carol);
    await obj('post-photos', 'shared/owned-by-carol.jpg', carol); // owned, outside their folder
    await obj('post-photos', `${dan}/keep.jpg`, dan);
    assert.equal(await reads('authenticated', carol, `${carol}/d/1.jpg`), 1, 'owner can read before');

    await del(carol);

    assert.deepEqual(await queued(carol), [
      { bucket_id: 'diary-photos', path: `${carol}/d/1.jpg`, reason: 'account deleted', attempts: 0 },
      { bucket_id: 'post-photos', path: `${carol}/orphan.jpg`, reason: 'account deleted', attempts: 0 },
      { bucket_id: 'post-photos', path: `${carol}/post.jpg`, reason: 'account deleted', attempts: 0 },
      { bucket_id: 'post-photos', path: 'shared/owned-by-carol.jpg', reason: 'account deleted', attempts: 0 },
    ]);
    assert.deepEqual(await queued(dan), [{ bucket_id: 'post-photos', path: 'shared/owned-by-carol.jpg', reason: 'account deleted', attempts: 0 }]);
    // The DB leaves the files for the Storage API job.
    assert.equal(await n(`select count(*) n from storage.objects where name like $1`, [`${carol}/%`]), 3);
    assert.equal(await n('select count(*) n from auth.users where id = $1', [carol]), 0);
  });

  it("the deleted user's files aren't readable by anyone", async () => {
    for (const name of [`${carol}/post.jpg`, `${carol}/orphan.jpg`, `${carol}/d/1.jpg`, 'shared/owned-by-carol.jpg']) {
      assert.equal(await reads('authenticated', dan, name), 0, `dan ${name}`);
      assert.equal(await reads('anon', null, name), 0, `anon ${name}`);
    }
    assert.equal(await reads('authenticated', erin, `${carol}/d/1.jpg`), 0);
  });

  it('is atomic: if the account delete fails, nothing is queued and the user stays', async () => {
    await obj('post-photos', `${erin}/x.jpg`, erin);
    await db.query(`create function public.test_block_delete() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
    await db.query('create trigger test_block before delete on auth.users for each row execute function public.test_block_delete()');
    try {
      await assert.rejects(del(erin), /boom/);
    } finally {
      await db.query('drop trigger test_block on auth.users');
      await db.query('drop function public.test_block_delete()');
    }
    assert.deepEqual(await queued(erin), [{ bucket_id: 'post-photos', path: 'shared/owned-by-carol.jpg', reason: 'account deleted', attempts: 0 }]);
    assert.equal(await n('select count(*) n from auth.users where id = $1', [erin]), 1);
  });

  it('re-queuing an already-queued path is harmless', async () => {
    await db.query(`insert into public.storage_deletion_queue (bucket_id, path, reason) values ('post-photos', $1, 'crew deleted')`, [`${dan}/keep.jpg`]);
    await del(dan);
    assert.equal(await n('select count(*) n from public.storage_deletion_queue where path = $1', [`${dan}/keep.jpg`]), 1);
    assert.equal(await n('select count(*) n from auth.users where id = $1', [dan]), 0);
  });

  it("delete_my_account's source has no storage delete", async () => {
    const src = (await db.query(`select prosrc from pg_proc where proname = 'delete_my_account'`)).rows[0].prosrc;
    assert.doesNotMatch(src, /delete\s+from\s+storage/i);
    assert.match(src, /storage_deletion_queue/);
  });
});
