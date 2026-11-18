// The v1 app's post-photo flow against the current migrations (no new schema):
// the author uploads directly (authenticated RLS) to post-photos/<uid>/<photo id>.<ext>,
// then inserts the post with photo_path set. Others only read it after the delay.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a7';
const bob = '00000000-0000-4000-8000-0000000000b7';
let db;

const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const seesPhoto = async (user, name) =>
  (await q(user, `select 1 from storage.objects where bucket_id = 'post-photos' and name = $1`, [name])).rows.length === 1;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'a7@example.test');
  await createUser(db, bob, 'b7@example.test');
});

describe('post photo app flow (direct upload, photo_path on insert)', () => {
  it('author uploads to their folder, posts with photo_path; others see it only after public_after', async () => {
    const name = `${alice}/3f2c1d4e-0000-4000-8000-000000000001.jpg`;
    await q(alice, `insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, $2)`, [name, alice]);
    const { rows } = await q(
      alice,
      `insert into public.posts (author_id, kind, species, caption, location_visibility, hunted_on, photo_path)
       values ($1, 'hunt', 'pheasant', 'photo', 'hidden', current_date, $2) returning id, public_after`,
      [alice, name],
    );
    assert.ok(new Date(rows[0].public_after).getTime() > Date.now());
    assert.equal(await seesPhoto(alice, name), true);
    assert.equal(await seesPhoto(bob, name), false);
    await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [rows[0].id]);
    assert.equal(await seesPhoto(bob, name), true);
  });

  it('accepts the picker types (png/webp/heic paths) and refuses uploads into someone else\'s folder', async () => {
    for (const ext of ['png', 'webp', 'heic']) {
      await q(alice, `insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, $2)`, [`${alice}/p.${ext}`, alice]);
    }
    await assert.rejects(
      q(bob, `insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, $2)`, [`${alice}/sneaky.jpg`, bob]),
      /row-level security/,
    );
  });

  it('the author can delete the photo when deleting the post; others cannot', async () => {
    const name = `${alice}/to-delete.jpg`;
    await q(alice, `insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, $2)`, [name, alice]);
    const del = async (user) => (await q(user, `delete from storage.objects where bucket_id = 'post-photos' and name = $1 returning name`, [name])).rows.length;
    assert.equal(await del(bob), 0);
    assert.equal(await del(alice), 1);
  });

  it('bucket limits match the app (10 MB; jpeg/png/webp/heic)', async () => {
    const { rows } = await db.query(`select file_size_limit, allowed_mime_types from storage.buckets where id in ('post-photos', 'diary-photos') order by id`);
    for (const r of rows) {
      assert.equal(Number(r.file_size_limit), 10 * 1024 * 1024);
      assert.deepEqual([...r.allowed_mime_types].sort(), ['image/heic', 'image/jpeg', 'image/png', 'image/webp']);
    }
  });
});
