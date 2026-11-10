import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

let db;
before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
});

describe('photo buckets: owner-folder direct uploads', () => {
  it('allows jpeg/png/webp/heic and a 10 MB cap on both photo buckets', async () => {
    const { rows } = await db.query(
      `select id, allowed_mime_types, file_size_limit from storage.buckets
        where id in ('diary-photos', 'post-photos') order by id`,
    );
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.deepEqual(r.allowed_mime_types, ALLOWED, r.id);
      assert.equal(Number(r.file_size_limit), 10485760, r.id);
    }
  });

  for (const bucket of ['diary-photos', 'post-photos']) {
    it(`lets the owner INSERT into their folder on ${bucket}, and denies other folders`, async () => {
      const own = bucket === 'diary-photos' ? `${alice}/entry/p.jpg` : `${alice}/p.jpg`;
      const other = bucket === 'diary-photos' ? `${bob}/entry/p.jpg` : `${bob}/p.jpg`;
      const ins = await as(db, 'authenticated', alice, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [bucket, own, alice]),
      );
      assert.ok((ins.affectedRows ?? ins.rowCount ?? 0) >= 1);
      await assert.rejects(
        as(db, 'authenticated', alice, (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [bucket, other, alice]),
        ),
        /row-level security/,
      );
    });

    it(`lets the owner UPDATE their object on ${bucket}, and denies other users`, async () => {
      const path = bucket === 'diary-photos' ? `${alice}/entry/u.jpg` : `${alice}/u.jpg`;
      await db.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [bucket, path, alice]);
      const upd = await as(db, 'authenticated', alice, (tx) =>
        tx.query(`update storage.objects set owner = $3 where bucket_id = $1 and name = $2`, [bucket, path, alice]),
      );
      assert.ok((upd.affectedRows ?? upd.rowCount ?? 0) >= 1);
      let denied = false;
      try {
        const res = await as(db, 'authenticated', bob, (tx) =>
          tx.query(`update storage.objects set owner = $3 where bucket_id = $1 and name = $2`, [bucket, path, bob]),
        );
        denied = (res.affectedRows ?? res.rowCount ?? 0) === 0;
      } catch (e) {
        denied = /row-level security|permission denied/i.test(String(e));
      }
      assert.equal(denied, true);
      const { rows } = await db.query(`select owner from storage.objects where bucket_id = $1 and name = $2`, [bucket, path]);
      assert.equal(rows[0].owner, alice);
    });

    it(`still lets the owner DELETE from ${bucket}`, async () => {
      const path = bucket === 'diary-photos' ? `${alice}/entry/d.jpg` : `${alice}/d.jpg`;
      await db.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [bucket, path, alice]);
      const del = await as(db, 'authenticated', alice, (tx) =>
        tx.query(`delete from storage.objects where bucket_id = $1 and name = $2`, [bucket, path]),
      );
      assert.ok((del.affectedRows ?? del.rowCount ?? 0) >= 1);
      const { rows } = await db.query(`select count(*)::int as n from storage.objects where bucket_id = $1 and name = $2`, [
        bucket,
        path,
      ]);
      assert.equal(rows[0].n, 0);
    });
  }
});
