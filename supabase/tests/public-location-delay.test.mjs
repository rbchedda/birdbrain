// Delay-only exact locations: authors see pending posts immediately;
// others see the real point only after public_after, and never post_locations.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b1';

const LNG = -77.7912;
const LAT = 40.8123;

let db;
const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));

async function postWithLocation(user, visibility = 'blurred') {
  const id = (
    await q(
      user,
      `insert into public.posts (author_id, species, caption, location_visibility)
       values ($1, 'pheasant', 'morning', $2) returning id`,
      [user, visibility],
    )
  ).rows[0].id;
  await q(
    user,
    `insert into public.post_locations (post_id, geom)
     values ($1, extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326))`,
    [id, LNG, LAT],
  );
  return id;
}

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'a@example.test');
  await createUser(db, bob, 'b@example.test');
});

describe('exact public location after the delay', () => {
  it('lets the author read a pending post and its exact public_geom', async () => {
    const id = await postWithLocation(alice);
    const pending = (await q(alice, 'select public_after > now() later from public.posts where id = $1', [id]))
      .rows[0].later;
    assert.equal(pending, true);
    const { rows } = await q(
      alice,
      `select extensions.st_x(public_geom) x, extensions.st_y(public_geom) y,
              extensions.st_distance(
                public_geom::extensions.geography,
                extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326)::extensions.geography
              ) d
         from public.posts where id = $1`,
      [id, LNG, LAT],
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].d < 0.01, `author offset was ${rows[0].d} m`);
    assert.equal(Number(rows[0].x).toFixed(5), LNG.toFixed(5));
    assert.equal(Number(rows[0].y).toFixed(5), LAT.toFixed(5));
  });

  it('hides a pending post (and its location) from other users', async () => {
    const id = await postWithLocation(alice);
    assert.equal((await q(bob, 'select id from public.posts where id = $1', [id])).rows.length, 0);
    assert.equal((await q(bob, 'select * from public.post_locations where post_id = $1', [id])).rows.length, 0);
  });

  it('returns the real location to others only after the delay', async () => {
    const id = await postWithLocation(alice);
    await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [id]);
    const { rows } = await q(
      bob,
      `select extensions.st_x(public_geom) x, extensions.st_y(public_geom) y,
              extensions.st_distance(
                public_geom::extensions.geography,
                extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326)::extensions.geography
              ) d
         from public.posts where id = $1`,
      [id, LNG, LAT],
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].d < 0.01, `public offset was ${rows[0].d} m`);
    // Exact table remains author-only.
    assert.equal((await q(bob, 'select * from public.post_locations where post_id = $1', [id])).rows.length, 0);
    assert.equal((await q(alice, 'select * from public.post_locations where post_id = $1', [id])).rows.length, 1);
  });

  it('clears public_geom when the author hides the location; clients cannot write it', async () => {
    const id = await postWithLocation(alice);
    await q(alice, `update public.posts set location_visibility = 'hidden' where id = $1`, [id]);
    assert.equal(
      (await db.query('select public_geom is null hidden from public.posts where id = $1', [id])).rows[0].hidden,
      true,
    );
    await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [id]);
    const { rows } = await q(bob, 'select public_geom from public.posts where id = $1', [id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].public_geom, null);
    await assert.rejects(
      q(
        alice,
        `update public.posts set public_geom = extensions.st_setsrid(extensions.st_makepoint(0, 0), 4326) where id = $1`,
        [id],
      ),
      /permission denied/,
    );
  });

  it('resets public_after on a pending content edit, and has no blur functions', async () => {
    const id = await postWithLocation(alice);
    const before = (await db.query('select public_after from public.posts where id = $1', [id])).rows[0].public_after;
    await db.query(`update public.posts set public_after = now() + interval '1 hour' where id = $1`, [id]);
    await q(alice, `update public.posts set caption = 'edited later' where id = $1`, [id]);
    const after = (await db.query('select public_after from public.posts where id = $1', [id])).rows[0].public_after;
    assert.ok(new Date(after) >= new Date(before), 'public_after moved backward');
    const missing = await db.query(`
      select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('blur_point_keyed', 'blur_point', 'guard_post_blurred_geom', 'sync_post_blurred_geom')
    `);
    assert.equal(missing.rows.length, 0);
    assert.equal(
      (await db.query(`select to_regclass('private.blur_salt') is null as gone`)).rows[0].gone,
      true,
    );
    assert.equal(
      (await db.query(`select to_regclass('public.posts') is not null`)).rows.length,
      1,
    );
    const cols = await db.query(`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'posts'
         and column_name in ('blurred_geom', 'public_geom')
       order by 1
    `);
    assert.deepEqual(cols.rows.map((r) => r.column_name), ['public_geom']);
  });
});
