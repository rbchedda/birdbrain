import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

/*
 * Hybrid guest mode: signed-out users browse on the anon key with no user and
 * no anonymous account. The anon role must read the public map/reference data
 * and nothing private.
 */
const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';
const entry = '11111111-1111-4111-8111-111111111111';

// Map, SGLs, access labels/warnings (places.properties.access_type), stocking, counties, data freshness.
const PUBLIC = ['places', 'stocking_events', 'stocking_properties', 'counties', 'place_stocking_county', 'stocking_county_totals'];
// ingest_state is service-role bookkeeping (RLS on, no policies): not readable by anyone in the app, by design.
// Personal or social data: never visible signed out.
const PRIVATE = [
  'hunt_log_entries', 'diary_entries', 'saved_places', 'group_members', 'posts', 'post_locations', 'post_place_counts',
  'comments', 'likes', 'saves', 'profiles', 'dogs', 'species_prefs', 'user_blocks', 'reports', 'blocklist_terms',
];

let db;
const enumFirst = (t) => `(pg_catalog.enum_range(null::public.${t}))[1]`;
const anonCount = (rel) => as(db, 'anon', null, async (tx) => Number((await tx.query(`select count(*) from public.${rel}`)).rows[0].count));

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  const poly = `extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromtext('POLYGON((-77 40,-76.9 40,-76.9 40.1,-77 40.1,-77 40))'), 4326))`;
  const placeType = (await db.query(`select pg_catalog.format_type(atttypid, atttypmod) t from pg_attribute where attrelid = 'public.places'::regclass and attname = 'type'`)).rows[0].t;
  // Superuser seeds bypass RLS.
  await db.exec(`
    insert into public.counties (geom, name, fips, source) values (${poly}, 'Centre', '42027', 'test');
    insert into public.places (geom, source_id, source, name, type, properties)
      values (${poly}, 'sgl-176', 'test', 'SGL 176', (pg_catalog.enum_range(null::${placeType}))[1], '{"access_type":"public"}'),
             (${poly}, 'stock-1', 'test', 'Stocked field', 'stocking', '{}');
    insert into public.stocking_events (ship_week, window_start, window_end, cocks, hens, source, release_label, release, county, region, season, junior)
      values ('W1', '2026-10-20', '2026-10-26', 10, 5, 'test', 'PRE SEASON', 'pre_season', 'Centre', 'Northcentral', '2026-27', false);
    insert into public.stocking_properties (county, season, region, name, source) values ('Centre', '2026-27', 'Northcentral', 'SGL 176', 'test');
    insert into public.blocklist_terms (term) values ('slur');
    insert into public.groups (name, slug) values ('Pheasant', 'pheasant-test');
    insert into public.dogs (owner_id, name) values ('${alice}', 'Rosie');
    insert into public.species_prefs (user_id, species) values ('${alice}', ${enumFirst('species')});
    insert into public.user_blocks (blocker_id, blocked_id) values ('${alice}', '${bob}');
  `);
  const placeId = (await db.query('select id from public.places limit 1')).rows[0].id;
  const groupId = (await db.query('select id from public.groups limit 1')).rows[0].id;
  // A public (already past its delay) post with everything hanging off it.
  const postId = (await db.query(`insert into public.posts (author_id, public_after) values ($1, now() - interval '2 days') returning id`, [alice])).rows[0].id;
  await db.exec(`
    insert into public.post_locations (post_id, geom) values ('${postId}', extensions.st_setsrid(extensions.st_makepoint(-77, 40), 4326));
    insert into public.post_place_counts (post_id) values ('${postId}');
    insert into public.comments (post_id, author_id, body, public_after) values ('${postId}', '${bob}', 'nice', now() - interval '1 day');
    insert into public.reports (reporter_id, reason, post_id) values ('${bob}', ${enumFirst('report_reason')}, '${postId}');
    insert into public.likes (post_id, user_id) values ('${postId}', '${bob}');
    insert into public.saves (post_id, user_id) values ('${postId}', '${bob}');
    insert into public.saved_places (user_id, place_id) values ('${alice}', '${placeId}');
    insert into public.group_members (user_id, group_id) values ('${alice}', '${groupId}');
  `);
  await as(db, 'authenticated', alice, (tx) =>
    tx.query(`select * from public.upsert_diary_entry($1, null, 'pheasant', 'private', '2026-10-20', '[]', $2)`, [entry, JSON.stringify({ dogs: [], cover: [], flushes: 2, shots: 1, birds: [], notes: 'secret spot', photos: [] })]).catch(() =>
      tx.query(`select * from public.upsert_hunt_log_entry($1, null, 'pheasant', 'private', '2026-10-20', '[]')`, [entry]),
    ),
  );
});

describe('guest (anon role) public reads', () => {
  for (const rel of PUBLIC) {
    it(`anon can read ${rel}`, async () => {
      assert.ok((await anonCount(rel)) > 0, `${rel} should be readable signed out`);
    });
  }

  it('anon sees access labels on places', async () => {
    const { rows } = await as(db, 'anon', null, (tx) => tx.query(`select properties->>'access_type' a from public.places`));
    assert.equal(rows[0].a, 'public');
  });

  it('anon cannot write public data', async () => {
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query(`update public.places set name = 'x'`)).then(async () => {
      if ((await db.query(`select count(*) from public.places where name = 'x'`)).rows[0].count !== 0) throw new Error('wrote');
      throw new Error('no-op');
    }), /permission denied|no-op/);
  });
});

describe('guest (anon role) private tables', () => {
  for (const rel of PRIVATE) {
    it(`anon cannot read ${rel}`, async () => {
      const total = Number((await db.query(`select count(*) from public.${rel}`)).rows[0].count);
      assert.ok(total > 0, `seed ${rel}`);
      const seen = await anonCount(rel).catch((e) => (/permission denied/.test(e.message) ? 0 : Promise.reject(e)));
      assert.equal(seen, 0, `${rel} leaked ${seen} row(s) to anon`);
    });
  }
});
