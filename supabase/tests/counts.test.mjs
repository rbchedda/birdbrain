import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';

let db;
let postId;
let fieldA;
let fieldB;

const place = async (name) =>
  (
    await db.query(
      `insert into public.places (type, name, county, species, geom, source, source_id)
       values ('stocking', $1, 'Lancaster', '{pheasant}', extensions.st_setsrid(extensions.st_makepoint(-76.3, 40.05), 4326), 'test', $1)
       returning id`,
      [name],
    )
  ).rows[0].id;
const counts = async (id) => (await db.query('select counts from public.posts where id = $1', [id])).rows[0].counts;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  fieldA = await place('Field A');
  fieldB = await place('Field B');
  postId = await as(db, 'authenticated', alice, async (tx) => {
    const { rows } = await tx.query(
      `insert into public.posts (author_id, species, caption) values ($1, 'pheasant', 'two fields') returning id`,
      [alice],
    );
    await tx.query(
      `insert into public.post_place_counts (post_id, place_id, flushed, roosters, harvested)
       values ($1, $2, 4, 2, 1), ($1, $3, 2, 1, 1)`,
      [rows[0].id, fieldA, fieldB],
    );
    return rows[0].id;
  });
  await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [postId]);
});

describe('per-place bird counts', () => {
  it('starts posts with empty totals', async () => {
    const id = await as(db, 'authenticated', bob, async (tx) =>
      (await tx.query(`insert into public.posts (author_id) values ($1) returning id`, [bob])).rows[0].id,
    );
    assert.deepEqual(await counts(id), {});
  });

  it('derives public totals on the post', async () => {
    assert.deepEqual(await counts(postId), { flushed: 6, roosters: 3, harvested: 2 });
  });

  it('shows totals but not the places to other users', async () => {
    const seen = await as(db, 'authenticated', bob, (tx) =>
      tx.query('select counts from public.posts where id = $1', [postId]),
    );
    assert.deepEqual(seen.rows[0].counts, { flushed: 6, roosters: 3, harvested: 2 });
    const rows = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.post_place_counts'));
    assert.equal(rows.rows.length, 0);
  });

  it('shows the per-place breakdown to the author', async () => {
    const { rows } = await as(db, 'authenticated', alice, (tx) =>
      tx.query('select place_id, harvested from public.post_place_counts order by flushed desc'),
    );
    assert.deepEqual(rows, [
      { place_id: fieldA, harvested: 1 },
      { place_id: fieldB, harvested: 1 },
    ]);
  });

  it('does not let others add counts to someone else’s post', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query(`insert into public.post_place_counts (post_id, place_id, flushed) values ($1, $2, 50)`, [postId, fieldA]),
      ),
      /row-level security/,
    );
  });

  it('does not let clients write totals directly', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(`update public.posts set counts = '{"harvested": 99}' where id = $1`, [postId]),
      ),
      /permission denied/,
    );
  });

  it('recomputes totals on update and delete', async () => {
    await as(db, 'authenticated', alice, (tx) =>
      tx.query('update public.post_place_counts set harvested = 0 where post_id = $1 and place_id = $2', [postId, fieldB]),
    );
    assert.deepEqual(await counts(postId), { flushed: 6, roosters: 3, harvested: 1 });
    await as(db, 'authenticated', alice, (tx) =>
      tx.query('delete from public.post_place_counts where post_id = $1', [postId]),
    );
    assert.deepEqual(await counts(postId), {});
  });

  it('keeps totals when a place is removed by re-ingest', async () => {
    await as(db, 'authenticated', alice, (tx) =>
      tx.query(`insert into public.post_place_counts (post_id, place_id, flushed) values ($1, $2, 3)`, [postId, fieldA]),
    );
    await db.query('delete from public.places where id = $1', [fieldA]);
    assert.deepEqual(await counts(postId), { flushed: 3, roosters: 0, harvested: 0 });
  });

  it('rejects negative counts', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(`insert into public.post_place_counts (post_id, place_id, flushed) values ($1, $2, -1)`, [postId, fieldB]),
      ),
      /check constraint/,
    );
  });
});
