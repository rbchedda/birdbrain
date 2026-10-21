// Runs the app's placeDetail query shape (app/src/data/placeDetailQuery.json,
// used by supabaseBackend.ts) against a DB built from every migration, so a
// schema change that drops a selected column fails here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const q = JSON.parse(readFileSync(new URL('../../app/src/data/placeDetailQuery.json', import.meta.url), 'utf8'));
const alice = '00000000-0000-4000-8000-00000000000a';
let db;
let placeId;

// Same SQL PostgREST builds for .select(cols).eq(key, v).order(col).
const select = (spec, where, order) =>
  `select ${spec.columns.map((c) => `"${c}"`).join(', ')} from public.${spec.table} where "${where}" = $1${order ? ` order by "${order}"` : ''}`;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  const { rows } = await db.query(
    `insert into public.places (name, type, county, species, geom, source, source_id)
     values ('Stocking point', 'stocking', 'Centre', '{pheasant}',
             extensions.st_geomfromtext('POINT(-77.86 40.79)', 4326), 'test', 'p1')
     returning id`,
  );
  placeId = rows[0].id;
  await db.exec(`
    insert into public.stocking_events
      (season, region, county, release, release_label, junior, ship_week, window_start, window_end, cocks, hens, source)
    values
      ('2026-27', 'Northcentral', 'Centre', 'pre_season', 'PRE- SEASON', false, 'Oct 21-23', '2026-10-21', '2026-10-23', 480, 170, 'test'),
      ('2026-27', 'Northcentral', 'Centre', 'youth', 'YOUTH HUNT', true, 'Oct 8-9', '2026-10-08', '2026-10-09', 160, 60, 'test'),
      ('2026-27', 'Northcentral', 'Clinton', 'youth', 'YOUTH HUNT', true, 'Oct 8-9', '2026-10-08', '2026-10-09', 99, 9, 'test');
  `);
});

describe('placeDetail query shape matches the current schema', () => {
  for (const role of ['anon', 'authenticated']) {
    it(`place row (with outline) is readable by ${role}`, async () => {
      const { rows } = await as(db, role, role === 'anon' ? null : alice, (tx) => tx.query(select(q.place, q.place.key), [placeId]));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].county, 'Centre');
      assert.equal(rows[0].type, 'stocking');
      assert.ok(rows[0].geom, 'outline geometry present');
    });

    it(`stocking events by the place's county are readable by ${role}, in window order`, async () => {
      const { rows } = await as(db, role, role === 'anon' ? null : alice, (tx) =>
        tx.query(select(q.stocking, q.stocking.filter, q.stocking.order), ['Centre']),
      );
      assert.deepEqual(rows.map((r) => [r.release, r.cocks, r.hens]), [['youth', 160, 60], ['pre_season', 480, 170]]);
      assert.deepEqual(Object.keys(rows[0]).sort(), [...q.stocking.columns].sort());
    });
  }

  it('fails loudly if a selected column is removed (guards the old place_id bug)', async () => {
    await assert.rejects(db.query(`select place_id from public.stocking_events`), /column "place_id" does not exist/);
  });
});
