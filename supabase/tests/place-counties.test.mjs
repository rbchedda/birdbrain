import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
let db;
// Two adjacent test squares; real county names so they match stocking_events.
const square = (x0, y0, x1, y1) => `MULTIPOLYGON(((${x0} ${y0},${x1} ${y0},${x1} ${y1},${x0} ${y1},${x0} ${y0})))`;
const addPlace = async (name, type, wkt, county = null) =>
  (await db.query(
    `insert into public.places (name, type, county, geom, source, source_id)
     values ($1, $2, $3, extensions.st_geomfromtext($4, 4326), 'test', $1) returning id, county`,
    [name, type, county, wkt],
  )).rows[0];

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await db.query(
    `insert into public.counties (name, fips, geom, source) values
       ('Centre', '027', extensions.st_geomfromtext($1, 4326), 'test'),
       ('Clinton', '035', extensions.st_geomfromtext($2, 4326), 'test')`,
    [square(-78, 40, -77, 41), square(-78, 41, -77, 42)],
  );
  await db.exec(`
    insert into public.stocking_events
      (season, region, county, release, release_label, junior, ship_week, window_start, window_end, cocks, hens, source)
    values ('2026-27', 'Northcentral', 'Centre', 'in_season_2', '2ND IN- SEASON', false, 'Nov. 3-6', '2026-11-03', '2026-11-06', 480, 170, 'test');
  `);
});

describe('place county by spatial join', () => {
  it('sets county on insert from the containing county', async () => {
    assert.equal((await addPlace('pt', 'stocking', 'POINT(-77.5 40.5)')).county, 'Centre');
    assert.equal((await addPlace('pt2', 'stocking', 'POINT(-77.5 41.5)')).county, 'Clinton');
  });

  it('keeps a county the source supplied', async () => {
    assert.equal((await addPlace('given', 'stocking', 'POINT(-77.5 40.5)', 'Clinton')).county, 'Clinton');
  });

  it('leaves county null outside every county (never guesses)', async () => {
    assert.equal((await addPlace('offmap', 'stocking', 'POINT(-70 30)')).county, null);
  });

  it('uses the point on surface for a polygon spanning two counties', async () => {
    const p = await addPlace('sgl', 'game_land', square(-77.9, 40.2, -77.1, 41.1));
    const { rows } = await db.query(
      `select public.county_at(extensions.st_geomfromtext($1, 4326)) c`, [square(-77.9, 40.2, -77.1, 41.1)]);
    assert.equal(p.county, rows[0].c);
    assert.ok(['Centre', 'Clinton'].includes(p.county));
  });

  it('fills a place on update when county is cleared (re-ingest)', async () => {
    const { id } = await addPlace('re', 'stocking', 'POINT(-77.5 40.5)');
    const { rows } = await db.query(`update public.places set county = null where id = $1 returning county`, [id]);
    assert.equal(rows[0].county, 'Centre');
  });

  it('backfills places loaded before counties', async () => {
    await db.query(`alter table public.places disable trigger places_set_county`);
    const { id } = await addPlace('early', 'stocking', 'POINT(-77.2 41.2)');
    await db.query(`alter table public.places enable trigger places_set_county`);
    const n = (await db.query('select public.assign_place_counties() n')).rows[0].n;
    assert.ok(n >= 1);
    assert.equal((await db.query('select county from public.places where id = $1', [id])).rows[0].county, 'Clinton');
  });

  it('lets the planner match a live stocking point to its county release weeks', async () => {
    const { rows } = await as(db, 'anon', null, (tx) =>
      tx.query(
        `select e.release, e.window_start::text, e.cocks from public.places p
           join public.stocking_events e on e.county = p.county
          where p.name = 'pt'`,
      ),
    );
    assert.deepEqual(rows, [{ release: 'in_season_2', window_start: '2026-11-03', cocks: 480 }]);
  });
});

describe('counties access', () => {
  it('is readable by anon and authenticated, not writable', async () => {
    for (const [role, uid] of [['anon', null], ['authenticated', alice]]) {
      const { rows } = await as(db, role, uid, (tx) => tx.query('select count(*)::int n from public.counties'));
      assert.equal(rows[0].n, 2);
      await assert.rejects(
        as(db, role, uid, (tx) => tx.query(`delete from public.counties where name = 'Centre' returning name`).then((r) => {
          if (r.rows.length === 0) throw new Error('row-level security: no rows');
        })),
        /permission denied|row-level security/,
      );
    }
  });

  it('only the service role can run the backfill (security definer)', async () => {
    for (const [role, uid] of [['anon', null], ['authenticated', alice]]) {
      await assert.rejects(
        as(db, role, uid, (tx) => tx.query('select public.assign_place_counties()')),
        /permission denied/,
        role,
      );
    }
    const { rows } = await as(db, 'service_role', null, (tx) => tx.query('select public.assign_place_counties() n'));
    assert.equal(typeof rows[0].n, 'number');
    const def = await db.query(
      `select p.prosecdef, p.proconfig from pg_proc p where p.oid = 'public.assign_place_counties()'::regprocedure`,
    );
    assert.equal(def.rows[0].prosecdef, true);
    assert.deepEqual(def.rows[0].proconfig, ['search_path=""']);
  });
});

describe('place_stocking_county', () => {
  it('prefers the county PGC allocation lists the place under, else the spatial county', async () => {
    const listed = await addPlace('SGL listed elsewhere', 'stocking', 'POINT(-77.5 40.6)'); // spatially Centre
    const plain = await addPlace('plain point', 'stocking', 'POINT(-77.5 40.7)');
    await db.query(
      `insert into public.stocking_properties (season, region, county, name, sgl, place_id, source)
       values ('2026-27', 'Northcentral', 'Clinton', 'State Game Lands 999', 999, $1, 'test')`,
      [listed.id],
    );
    const { rows } = await as(db, 'anon', null, (tx) =>
      tx.query(`select place_id, county, basis from public.place_stocking_county where place_id = any($1::uuid[])`, [[listed.id, plain.id]]),
    );
    const by = Object.fromEntries(rows.map((r) => [r.place_id, [r.county, r.basis]]));
    assert.deepEqual(by[listed.id], ['Clinton', 'allocation']);
    assert.deepEqual(by[plain.id], ['Centre', 'spatial']);
  });

  it('falls back to spatial when the allocation lists the place in two counties', async () => {
    const two = await addPlace('two-county', 'stocking', 'POINT(-77.5 40.8)');
    await db.query(
      `insert into public.stocking_properties (season, region, county, name, sgl, place_id, source) values
         ('2026-27', 'Northcentral', 'Clinton', 'SGL 998 a', 998, $1, 'test'),
         ('2026-27', 'Northcentral', 'Lycoming', 'SGL 998 b', 998, $1, 'test')`,
      [two.id],
    );
    const { rows } = await db.query(`select county, basis from public.place_stocking_county where place_id = $1`, [two.id]);
    assert.deepEqual(rows[0], { county: 'Centre', basis: 'spatial' });
  });
});
