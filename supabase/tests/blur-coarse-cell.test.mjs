import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';

const up = readFileSync(new URL('../migrations/20261109001000_blur_coarse_cell.sql', import.meta.url), 'utf8');
const down = readFileSync(new URL('../rollbacks/20261109001000_blur_coarse_cell.down.sql', import.meta.url), 'utf8');

const centreLng = -77.7912;
const centreLat = 40.8123;

/** Geodesic distance in metres from (lng,lat) to a blur_point_keyed result. */
function distSql(lng, lat, author = alice) {
  return {
    text: `select extensions.st_distance(
             public.blur_point_keyed(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), $3)::extensions.geography,
             extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326)::extensions.geography
           ) d,
           public.blur_point_keyed(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), $3) g`,
    values: [lng, lat, author],
  };
}

async function blur(db, lng, lat, author = alice) {
  const { rows } = await db.query(distSql(lng, lat, author).text, distSql(lng, lat, author).values);
  return rows[0];
}

async function cellSamples(db, lng, lat, insetM = 1) {
  const { rows } = await db.query(
    `with metric as (
       select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), 5070) g
     ),
     cell as (
       select floor(extensions.st_x(g) / 1000.0) * 1000.0 as x0,
              floor(extensions.st_y(g) / 1000.0) * 1000.0 as y0
       from metric
     ),
     pts as (
       select name, extensions.st_transform(
         extensions.st_setsrid(extensions.st_makepoint(x, y), 5070), 4326) p
       from cell,
       lateral (values
         ('center', x0 + 500, y0 + 500),
         ('sw',     x0 + $3, y0 + $3),
         ('se',     x0 + 1000 - $3, y0 + $3),
         ('nw',     x0 + $3, y0 + 1000 - $3),
         ('ne',     x0 + 1000 - $3, y0 + 1000 - $3),
         ('e',      x0 + 1000 - $3, y0 + 500),
         ('w',      x0 + $3, y0 + 500),
         ('n',      x0 + 500, y0 + 1000 - $3),
         ('s',      x0 + 500, y0 + $3)
       ) v(name, x, y)
     )
     select name, extensions.st_x(p) lng, extensions.st_y(p) lat from pts`,
    [lng, lat, insetM],
  );
  return rows;
}

describe('blur_point_keyed coarse cell (M1)', () => {
  let db;

  before(async () => {
    db = await createTestDb();
    await createUser(db, alice, 'alice@example.test');
    await createUser(db, bob, 'bob@example.test');
  });

  it('maps points 1–20 m apart in the same cell to identical blurred_geom', async () => {
    const origin = await blur(db, centreLng, centreLat);
    for (const metres of [1, 5, 10, 20]) {
      for (const az of [0, 1.2, 2.4, 3.8, 5.1]) {
        const { rows } = await db.query(
          `select extensions.st_x(p) lng, extensions.st_y(p) lat
             from (select extensions.st_project(
               extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326)::extensions.geography,
               $3::double precision, $4::double precision)::extensions.geometry p) q`,
          [centreLng, centreLat, metres, az],
        );
        const other = await blur(db, rows[0].lng, rows[0].lat);
        assert.equal(
          other.g,
          origin.g,
          `blur diverged at ${metres} m az=${az}: ${origin.g} vs ${other.g}`,
        );
      }
    }
  });

  it('keeps the blurred point 1.5–3 km from the true point at centers, edges, corners, and random jitter', async () => {
    const sites = [
      [centreLng, centreLat],
      [-80.0851, 42.1292], // Erie
      [-75.1652, 39.9526], // Philadelphia
      [-80.519, 39.721], // SW corner of PA
    ];
    const distances = [];
    for (const [lng, lat] of sites) {
      const samples = await cellSamples(db, lng, lat, 1);
      assert.equal(samples.length, 9);
      const first = await blur(db, samples[0].lng, samples[0].lat);
      for (const s of samples) {
        const got = await blur(db, s.lng, s.lat);
        assert.equal(got.g, first.g, `same-cell ${s.name} at ${lng},${lat} diverged`);
        assert.ok(
          got.d >= 1500 - 0.01 && got.d <= 3000 + 0.01,
          `${s.name} at ${lng},${lat} distance ${got.d} m outside 1.5–3 km`,
        );
        distances.push(got.d);
      }
      // Random points inside the same cell (project < 20 m stays in cell for a center start,
      // plus a handful of larger in-cell offsets from the center sample).
      for (let i = 0; i < 25; i++) {
        const metres = 5 + ((i * 37) % 480);
        const az = (i * 0.7) % (2 * Math.PI);
        const { rows } = await db.query(
          `select extensions.st_x(p) lng, extensions.st_y(p) lat
             from (select extensions.st_project(
               extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326)::extensions.geography,
               $3::double precision, $4::double precision)::extensions.geometry p) q`,
          [samples[0].lng, samples[0].lat, metres, az],
        );
        const got = await blur(db, rows[0].lng, rows[0].lat);
        // A 480 m offset from the cell centre stays inside a 1 km cell; still assert bounds
        // even if a numerical edge crossed (then the blur may differ, but distance must hold).
        assert.ok(
          got.d >= 1500 - 0.01 && got.d <= 3000 + 0.01,
          `random ${metres} m at ${lng},${lat} distance ${got.d} m outside 1.5–3 km`,
        );
        distances.push(got.d);
      }
    }
    assert.ok(distances.length >= 9 * sites.length + 25 * sites.length);
  });

  it('gives different authors different blurred points for the same location', async () => {
    const a = await blur(db, centreLng, centreLat, alice);
    const b = await blur(db, centreLng, centreLat, bob);
    assert.notEqual(a.g, b.g);
    assert.ok(a.d >= 1500 - 0.01 && a.d <= 3000 + 0.01);
    assert.ok(b.d >= 1500 - 0.01 && b.d <= 3000 + 0.01);
  });

  it('revokes execute from client roles', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(
          `select public.blur_point_keyed(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), $3)`,
          [centreLng, centreLat, alice],
        ),
      ),
      /permission denied/,
    );
    await assert.rejects(
      as(db, 'anon', null, (tx) =>
        tx.query(
          `select public.blur_point_keyed(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), $3)`,
          [centreLng, centreLat, alice],
        ),
      ),
      /permission denied/,
    );
  });

  it('re-blurs existing posts through the guard trigger and leaves hidden rows null', async () => {
    const postBlurred = await as(db, 'authenticated', alice, async (tx) => {
      const { rows } = await tx.query(
        `insert into public.posts (author_id, species, caption) values ($1, 'grouse', 'a') returning id`,
        [alice],
      );
      await tx.query(
        `insert into public.post_locations (post_id, geom)
         values ($1, extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326))`,
        [rows[0].id, centreLng, centreLat],
      );
      return rows[0].id;
    });
    const postHidden = await as(db, 'authenticated', alice, async (tx) => {
      const { rows } = await tx.query(
        `insert into public.posts (author_id, species, caption, location_visibility)
         values ($1, 'grouse', 'h', 'hidden') returning id`,
        [alice],
      );
      await tx.query(
        `insert into public.post_locations (post_id, geom)
         values ($1, extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326))`,
        [rows[0].id, centreLng, centreLat],
      );
      return rows[0].id;
    });

    const expected = await blur(db, centreLng, centreLat, alice);
    await db.exec(up);
    const { rows } = await db.query(
      `select id, blurred_geom, location_visibility from public.posts where id in ($1, $2)`,
      [postBlurred, postHidden],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(byId[postBlurred].blurred_geom, expected.g);
    assert.equal(byId[postHidden].blurred_geom, null);
  });
});

describe('blur_point_keyed rollback', () => {
  it('restores the previous function and re-blurs; nearby points no longer share an offset', async () => {
    const db = await createTestDb();
    await createUser(db, alice, 'alice@example.test');

    const nearby = await db.query(
      `select extensions.st_x(p) lng, extensions.st_y(p) lat
         from (select extensions.st_project(
           extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326)::extensions.geography,
           15.0, 0.7)::extensions.geometry p) q`,
      [centreLng, centreLat],
    );
    const beforeA = await blur(db, centreLng, centreLat, alice);
    const beforeB = await blur(db, nearby.rows[0].lng, nearby.rows[0].lat, alice);
    assert.equal(beforeA.g, beforeB.g);

    await db.exec(down);

    const afterA = await blur(db, centreLng, centreLat, alice);
    const afterB = await blur(db, nearby.rows[0].lng, nearby.rows[0].lat, alice);
    assert.notEqual(afterA.g, afterB.g, 'old function should give independent offsets for 15 m jitter');
    // Previous definition snaps the result to 0.01°.
    const { rows: snapped } = await db.query(
      `select extensions.st_x(g) x, extensions.st_y(g) y
         from (select public.blur_point_keyed(
           extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), $3) g) q`,
      [centreLng, centreLat, alice],
    );
    const onGrid = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
    assert.ok(onGrid(snapped[0].x) && onGrid(snapped[0].y), `rollback result not on 0.01 grid: ${snapped[0].x},${snapped[0].y}`);

    // Re-applying the forward migration is safe and restores coarse-cell behaviour.
    await db.exec(up);
    const againA = await blur(db, centreLng, centreLat, alice);
    const againB = await blur(db, nearby.rows[0].lng, nearby.rows[0].lat, alice);
    assert.equal(againA.g, againB.g);
    assert.equal(againA.g, beforeA.g);
    assert.ok(againA.d >= 1500 - 0.01 && againA.d <= 3000 + 0.01);
  });
});
