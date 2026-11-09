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
const cellM = 250;

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

/**
 * Author's secret lattice origin and the 250 m cell that contains (lng,lat).
 * Labels must match 20261109001000_blur_coarse_cell.sql ('lattice:5070:250:').
 */
async function shiftedCell(db, lng, lat, author = alice) {
  const { rows } = await db.query(
    `with salt as (select s.salt from private.blur_salt s),
     lattice as (
       select extensions.hmac(
         convert_to('lattice:5070:250:' || $3::text, 'UTF8'),
         (select salt from salt),
         'sha256') h
     ),
     origin as (
       select
         (((get_byte(h, 0)::bigint << 24) | (get_byte(h, 1) << 16) | (get_byte(h, 2) << 8) | get_byte(h, 3)) / 4294967296.0) * 250.0 as dx,
         (((get_byte(h, 4)::bigint << 24) | (get_byte(h, 5) << 16) | (get_byte(h, 6) << 8) | get_byte(h, 7)) / 4294967296.0) * 250.0 as dy
       from lattice
     ),
     metric as (
       select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), 5070) g
     ),
     cell as (
       select o.dx, o.dy,
              o.dx + floor((extensions.st_x(m.g) - o.dx) / 250.0) * 250.0 as x0,
              o.dy + floor((extensions.st_y(m.g) - o.dy) / 250.0) * 250.0 as y0
       from origin o, metric m
     )
     select dx, dy, x0, y0,
            x0 + 125.0 as cx, y0 + 125.0 as cy
     from cell`,
    [lng, lat, author],
  );
  return rows[0];
}

async function cellSamples(db, lng, lat, author = alice, insetM = 1) {
  const { rows } = await db.query(
    `with salt as (select s.salt from private.blur_salt s),
     lattice as (
       select extensions.hmac(
         convert_to('lattice:5070:250:' || $4::text, 'UTF8'),
         (select salt from salt),
         'sha256') h
     ),
     origin as (
       select
         (((get_byte(h, 0)::bigint << 24) | (get_byte(h, 1) << 16) | (get_byte(h, 2) << 8) | get_byte(h, 3)) / 4294967296.0) * 250.0 as dx,
         (((get_byte(h, 4)::bigint << 24) | (get_byte(h, 5) << 16) | (get_byte(h, 6) << 8) | get_byte(h, 7)) / 4294967296.0) * 250.0 as dy
       from lattice
     ),
     metric as (
       select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), 5070) g
     ),
     cell as (
       select o.dx + floor((extensions.st_x(m.g) - o.dx) / 250.0) * 250.0 as x0,
              o.dy + floor((extensions.st_y(m.g) - o.dy) / 250.0) * 250.0 as y0
       from origin o, metric m
     ),
     pts as (
       select name, extensions.st_transform(
         extensions.st_setsrid(extensions.st_makepoint(x, y), 5070), 4326) p
       from cell,
       lateral (values
         ('center', x0 + 125, y0 + 125),
         ('sw',     x0 + $3, y0 + $3),
         ('se',     x0 + 250 - $3, y0 + $3),
         ('nw',     x0 + $3, y0 + 250 - $3),
         ('ne',     x0 + 250 - $3, y0 + 250 - $3),
         ('e',      x0 + 250 - $3, y0 + 125),
         ('w',      x0 + $3, y0 + 125),
         ('n',      x0 + 125, y0 + 250 - $3),
         ('s',      x0 + 125, y0 + $3)
       ) v(name, x, y)
     )
     select name, extensions.st_x(p) lng, extensions.st_y(p) lat from pts`,
    [lng, lat, insetM, author],
  );
  return rows;
}

async function project(db, lng, lat, metres, az) {
  const { rows } = await db.query(
    `select extensions.st_x(p) lng, extensions.st_y(p) lat
       from (select extensions.st_project(
         extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326)::extensions.geography,
         $3::double precision, $4::double precision)::extensions.geometry p) q`,
    [lng, lat, metres, az],
  );
  return rows[0];
}

async function cellBand(db, lng, lat, author = alice) {
  const { rows } = await db.query(
    `with salt as (select s.salt from private.blur_salt s),
     lattice as (
       select extensions.hmac(
         convert_to('lattice:5070:250:' || $3::text, 'UTF8'),
         (select salt from salt),
         'sha256') h
     ),
     origin as (
       select
         (((get_byte(h, 0)::bigint << 24) | (get_byte(h, 1) << 16) | (get_byte(h, 2) << 8) | get_byte(h, 3)) / 4294967296.0) * 250.0 as dx,
         (((get_byte(h, 4)::bigint << 24) | (get_byte(h, 5) << 16) | (get_byte(h, 6) << 8) | get_byte(h, 7)) / 4294967296.0) * 250.0 as dy
       from lattice
     ),
     metric as (
       select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), 5070) g
     ),
     cell as (
       select o.dx + floor((extensions.st_x(m.g) - o.dx) / 250.0) * 250.0 as x0,
              o.dy + floor((extensions.st_y(m.g) - o.dy) / 250.0) * 250.0 as y0
       from origin o, metric m
     ),
     corners as (
       select extensions.st_transform(
         extensions.st_setsrid(extensions.st_makepoint(x0 + 125, y0 + 125), 5070),
         4326)::extensions.geography as center,
         extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(x, y), 5070), 4326)::extensions.geography as c
       from cell,
       lateral (values
         (x0, y0), (x0 + 250, y0), (x0, y0 + 250), (x0 + 250, y0 + 250)
       ) v(x, y)
     )
     select max(extensions.st_distance(center, c)) as h
     from corners`,
    [lng, lat, author],
  );
  const h = Number(rows[0].h);
  return { h, width: 3000 - h - (1500 + h) };
}

describe('blur_point_keyed coarse cell (M1)', () => {
  let db;

  before(async () => {
    db = await createTestDb();
    await createUser(db, alice, 'alice@example.test');
    await createUser(db, bob, 'bob@example.test');
  });

  it('maps points 1–20 m apart in the same shifted cell to identical blurred_geom', async () => {
    // Use the interior of Alice's shifted cell, well away from the borders, so
    // a 20 m GPS-style jitter cannot cross into a neighbour.
    const samples = await cellSamples(db, centreLng, centreLat, alice, 40);
    const interior = samples.find((s) => s.name === 'center');
    const origin = await blur(db, interior.lng, interior.lat);
    for (const metres of [1, 5, 10, 20]) {
      for (const az of [0, 1.2, 2.4, 3.8, 5.1]) {
        const pt = await project(db, interior.lng, interior.lat, metres, az);
        const other = await blur(db, pt.lng, pt.lat);
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
      const band = await cellBand(db, lng, lat, alice);
      assert.ok(
        band.width >= 1000,
        `radial band width ${(band.width).toFixed(2)} m at ${lng},${lat} (h=${band.h}) is under 1000 m`,
      );
      const samples = await cellSamples(db, lng, lat, alice, 1);
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
      // Stay well inside a 250 m cell: 100 m from the centre is 25 m short of the edge.
      for (let i = 0; i < 25; i++) {
        const metres = 5 + ((i * 17) % 100);
        const az = (i * 0.7) % (2 * Math.PI);
        const pt = await project(db, samples[0].lng, samples[0].lat, metres, az);
        const got = await blur(db, pt.lng, pt.lat);
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

  it("gives two authors different secret grid origins", async () => {
    const a = await shiftedCell(db, centreLng, centreLat, alice);
    const b = await shiftedCell(db, centreLng, centreLat, bob);
    assert.ok(a.dx >= 0 && a.dx < cellM && a.dy >= 0 && a.dy < cellM, `alice origin out of range: ${a.dx},${a.dy}`);
    assert.ok(b.dx >= 0 && b.dx < cellM && b.dy >= 0 && b.dy < cellM, `bob origin out of range: ${b.dx},${b.dy}`);
    assert.ok(a.dx !== b.dx || a.dy !== b.dy, `authors unexpectedly share lattice origin ${a.dx},${a.dy}`);
  });

  it('keeps the radial band at least 1 km wide', async () => {
    const band = await cellBand(db, centreLng, centreLat, alice);
    assert.ok(band.h > 0, `h was ${band.h}`);
    assert.ok(
      band.width >= 1000,
      `band width ${band.width} m (h=${band.h}) is under the 1000 m floor`,
    );
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

    // Interior of the shifted cell so the 15 m pair is in the same cell before rollback.
    const samples = await cellSamples(db, centreLng, centreLat, alice, 40);
    const interior = samples.find((s) => s.name === 'center');
    const nearby = await project(db, interior.lng, interior.lat, 15.0, 0.7);
    const beforeA = await blur(db, interior.lng, interior.lat, alice);
    const beforeB = await blur(db, nearby.lng, nearby.lat, alice);
    assert.equal(beforeA.g, beforeB.g);

    await db.exec(down);

    const afterA = await blur(db, interior.lng, interior.lat, alice);
    const afterB = await blur(db, nearby.lng, nearby.lat, alice);
    assert.notEqual(afterA.g, afterB.g, 'old function should give independent offsets for 15 m jitter');
    // Previous definition snaps the result to 0.01°.
    const { rows: snapped } = await db.query(
      `select extensions.st_x(g) x, extensions.st_y(g) y
         from (select public.blur_point_keyed(
           extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326), $3) g) q`,
      [interior.lng, interior.lat, alice],
    );
    const onGrid = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
    assert.ok(onGrid(snapped[0].x) && onGrid(snapped[0].y), `rollback result not on 0.01 grid: ${snapped[0].x},${snapped[0].y}`);

    // Re-applying the forward migration is safe and restores coarse-cell behaviour.
    await db.exec(up);
    const againA = await blur(db, interior.lng, interior.lat, alice);
    const againB = await blur(db, nearby.lng, nearby.lat, alice);
    assert.equal(againA.g, againB.g);
    assert.equal(againA.g, beforeA.g);
    assert.ok(againA.d >= 1500 - 0.01 && againA.d <= 3000 + 0.01);
  });
});
