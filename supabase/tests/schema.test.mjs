import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';

let db;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  await db.exec(`
    insert into public.places (type, name, county, species, geom, source, source_id) values
      ('game_land', 'SGL Near', 'Centre', '{grouse}',
        extensions.st_geomfromtext('MULTIPOLYGON(((-77.80 40.80,-77.78 40.80,-77.78 40.82,-77.80 40.82,-77.80 40.80)))', 4326),
        'test', 'near'),
      ('dove_field', 'Dove Far', 'York', '{dove}',
        extensions.st_setsrid(extensions.st_makepoint(-76.70, 39.95), 4326),
        'test', 'far');
  `);
});

describe('migrations', () => {
  it('seeds one official group per species', async () => {
    const { rows } = await db.query('select species from public.groups where is_official order by species');
    assert.deepEqual(rows.map((r) => r.species), ['pheasant', 'dove', 'turkey', 'grouse', 'waterfowl']);
  });

  it('creates a profile for each new auth user', async () => {
    const { rows } = await db.query('select id, home_state from public.profiles order by id');
    assert.deepEqual(rows, [
      { id: alice, home_state: 'PA' },
      { id: bob, home_state: 'PA' },
    ]);
  });

  it('computes a centroid for places', async () => {
    const { rows } = await db.query(
      `select extensions.st_astext(centroid) c from public.places where source_id = 'near'`,
    );
    assert.match(rows[0].c, /^POINT\(-77\.7\d+ 40\.8\d+\)$/);
  });
});

describe('places', () => {
  it('are readable by anon users', async () => {
    const { rows } = await as(db, 'anon', null, (tx) => tx.query('select count(*)::int n from public.places'));
    assert.equal(rows[0].n, 2);
  });

  it('cannot be written by signed-in users', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(`insert into public.places (type, name, geom, source, source_id)
                  values ('game_land', 'x', extensions.st_setsrid(extensions.st_makepoint(0,0),4326), 'x', 'x')`),
      ),
      /row-level security/,
    );
  });

  it('places_near filters by radius and sorts nearest first', async () => {
    const near = await db.query('select name from public.places_near(-77.79, 40.81, 5000)');
    assert.deepEqual(near.rows.map((r) => r.name), ['SGL Near']);
    const all = await db.query('select name from public.places_near(-76.71, 39.96, 500000)');
    assert.deepEqual(all.rows.map((r) => r.name), ['Dove Far', 'SGL Near']);
  });
});

describe('post location privacy', () => {
  let postId;

  before(async () => {
    postId = await as(db, 'authenticated', alice, async (tx) => {
      const { rows } = await tx.query(
        `insert into public.posts (author_id, species, caption) values ($1, 'grouse', 'flush') returning id`,
        [alice],
      );
      await tx.query(
        `insert into public.post_locations (post_id, geom)
         values ($1, extensions.st_setsrid(extensions.st_makepoint(-77.7912, 40.8123), 4326))`,
        [rows[0].id],
      );
      return rows[0].id;
    });
    // Posts are hidden from others until the next day; age this one past the delay.
    await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [postId]);
  });

  it('snaps the public location to a grid cell center', async () => {
    const { rows } = await as(db, 'authenticated', bob, (tx) =>
      tx.query(
        `select extensions.st_x(blurred_geom) x, extensions.st_y(blurred_geom) y from public.posts where id = $1`,
        [postId],
      ),
    );
    assert.ok(Math.abs(rows[0].x - -77.775) < 1e-9, `x was ${rows[0].x}`);
    assert.ok(Math.abs(rows[0].y - 40.825) < 1e-9, `y was ${rows[0].y}`);
  });

  it('hides the exact location from other users', async () => {
    const { rows } = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.post_locations'));
    assert.equal(rows.length, 0);
  });

  it('shows the exact location to the author', async () => {
    const { rows } = await as(db, 'authenticated', alice, (tx) => tx.query('select * from public.post_locations'));
    assert.equal(rows.length, 1);
  });

  it('does not let clients write blurred_geom directly', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(
          `update public.posts set blurred_geom = extensions.st_setsrid(extensions.st_makepoint(-77.7912, 40.8123), 4326)
            where id = $1`,
          [postId],
        ),
      ),
      /permission denied/,
    );
  });

  it('clears and restores the public location when visibility changes', async () => {
    const read = () => db.query('select blurred_geom is null hidden from public.posts where id = $1', [postId]);
    await as(db, 'authenticated', alice, (tx) =>
      tx.query(`update public.posts set location_visibility = 'hidden' where id = $1`, [postId]),
    );
    assert.equal((await read()).rows[0].hidden, true);
    await as(db, 'authenticated', alice, (tx) =>
      tx.query(`update public.posts set location_visibility = 'blurred' where id = $1`, [postId]),
    );
    assert.equal((await read()).rows[0].hidden, false);
  });

  it('does not let another user move or delete someone else\u2019s exact location', async () => {
    const moved = await as(db, 'authenticated', bob, (tx) =>
      tx.query(
        `update public.post_locations set geom = extensions.st_setsrid(extensions.st_makepoint(0,0),4326)
          where post_id = $1`,
        [postId],
      ),
    );
    const deleted = await as(db, 'authenticated', bob, (tx) =>
      tx.query('delete from public.post_locations where post_id = $1', [postId]),
    );
    assert.equal(moved.affectedRows, 0);
    assert.equal(deleted.affectedRows, 0);
  });
});

describe('ownership rules', () => {
  it('users cannot edit someone else’s profile', async () => {
    const { affectedRows } = await as(db, 'authenticated', bob, (tx) =>
      tx.query(`update public.profiles set display_name = 'hacked' where id = $1`, [alice]),
    );
    assert.equal(affectedRows, 0);
  });

  it('users cannot post as someone else', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query(`insert into public.posts (author_id, caption) values ($1, 'x')`, [alice]),
      ),
      /row-level security/,
    );
  });

  it('saved places are private', async () => {
    await as(db, 'authenticated', alice, (tx) =>
      tx.query(`insert into public.saved_places (user_id, place_id)
                select $1, id from public.places where source_id = 'near'`, [alice]),
    );
    const mine = await as(db, 'authenticated', alice, (tx) => tx.query('select * from public.saved_places'));
    const theirs = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.saved_places'));
    assert.equal(mine.rows.length, 1);
    assert.equal(theirs.rows.length, 0);
  });

  it('users can join a group as a member but not as an admin', async () => {
    const join = (role) =>
      as(db, 'authenticated', bob, (tx) =>
        tx.query(
          `insert into public.group_members (group_id, user_id, role)
           select id, $1, $2::public.group_role from public.groups where slug = 'pa-grouse'`,
          [bob, role],
        ),
      );
    await assert.rejects(join('admin'), /row-level security/);
    await join('member');
  });

  it('users cannot create official groups', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query(`insert into public.groups (slug, name, is_official, created_by) values ('fake', 'Fake', true, $1)`, [
          bob,
        ]),
      ),
      /row-level security/,
    );
  });
});

describe('storage', () => {
  it('only lets users upload into their own folder', async () => {
    await as(db, 'authenticated', alice, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name) values ('post-photos', $1)`, [`${alice}/a.jpg`]),
    );
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('post-photos', $1)`, [`${alice}/b.jpg`]),
      ),
      /row-level security/,
    );
  });
});
