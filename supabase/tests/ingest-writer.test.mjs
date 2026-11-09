import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const owner = '00000000-0000-4000-8000-0000000000aa';
const square = 'MULTIPOLYGON(((-77 40,-76.9 40,-76.9 40.1,-77 40.1,-77 40)))';
const geom = `extensions.st_geomfromtext('${square}', 4326)`;

let db;

const roleFlags = (name) =>
  db.query(
    `select rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls, rolreplication
       from pg_roles where rolname = $1`,
    [name],
  );

const tablePrivs = (role, table) =>
  db.query(
    `select privilege_type from information_schema.role_table_grants
      where grantee = $1 and table_schema = 'public' and table_name = $2
      order by 1`,
    [role, table],
  ).then((r) => r.rows.map((x) => x.privilege_type));

before(async () => {
  db = await createTestDb();
  await createUser(db, owner, 'owner@example.test');
  await db.exec(`
    insert into public.counties (name, fips, geom, source) values ('Centre', '027', ${geom}, 'test');
    insert into public.places (name, type, geom, source, source_id)
      values ('SGL 176', 'game_land', ${geom}, 'pgc:state_game_lands', '176');
    insert into public.profiles (id, display_name) values ('${owner}', 'Owner')
      on conflict (id) do nothing;
  `);
});

describe('ingest_writer role', () => {
  it('exists as NOLOGIN, NOINHERIT, without BYPASSRLS or superuser', async () => {
    const { rows } = await roleFlags('ingest_writer');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rolcanlogin, false);
    assert.equal(rows[0].rolinherit, false);
    assert.equal(rows[0].rolsuper, false);
    assert.equal(rows[0].rolbypassrls, false);
    assert.equal(rows[0].rolreplication, false);
  });

  it('is granted only the four reference tables plus ingest_state', async () => {
    const { rows } = await db.query(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'ingest_writer' and table_schema = 'public'
        order by 1, 2`,
    );
    const byTable = {};
    for (const r of rows) (byTable[r.table_name] ??= []).push(r.privilege_type);
    assert.deepEqual(Object.keys(byTable).sort(), [
      'counties', 'ingest_state', 'places', 'stocking_events', 'stocking_properties',
    ]);
    for (const t of Object.keys(byTable)) {
      assert.deepEqual(byTable[t].sort(), ['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    }
    assert.deepEqual(await tablePrivs('ingest_writer', 'profiles'), []);
    assert.deepEqual(await tablePrivs('ingest_writer', 'posts'), []);
    assert.deepEqual(await tablePrivs('ingest_writer', 'storage_deletion_queue'), []);
  });

  it('can upsert a place, write ingest_state, and call assign_place_counties', async () => {
    const out = await as(db, 'ingest_writer', null, async (tx) => {
      await tx.query(
        `insert into public.places (name, type, geom, source, source_id)
         values ('Stocked', 'stocking', ${geom}, 'pgc:pheasant_stocking', 'sgl:176')`,
      );
      await tx.query(
        `insert into public.ingest_state (source, layer_url, feature_count)
         values ('pgc:pheasant_stocking', 'https://example.test', 1)
         on conflict (source) do update set feature_count = excluded.feature_count`,
      );
      const n = await tx.query('select public.assign_place_counties() n');
      const place = await tx.query(`select county from public.places where source_id = 'sgl:176'`);
      return { n: n.rows[0].n, county: place.rows[0].county };
    });
    assert.equal(out.county, 'Centre');
  });

  it('cannot read or write user-owned tables', async () => {
    await assert.rejects(
      () => as(db, 'ingest_writer', null, (tx) => tx.query('select id, display_name from public.profiles')),
      /permission denied|42501/,
    );
    await assert.rejects(
      () => as(db, 'ingest_writer', null, (tx) => tx.query('select * from public.posts')),
      /permission denied|42501/,
    );
    await assert.rejects(
      () => as(db, 'ingest_writer', null, (tx) =>
        tx.query(`insert into public.profiles (id, display_name) values ('${owner}', 'x')`)),
      /permission denied|42501/,
    );
  });

  it('cannot execute account-deletion or other non-ingest functions', async () => {
    await assert.rejects(
      () => as(db, 'ingest_writer', null, (tx) => tx.query('select public.delete_my_account()')),
      /permission denied|42501/,
    );
    // The role itself is not a member of service_role or postgres.
    const { rows } = await db.query(
      `select r.rolname from pg_auth_members m
         join pg_roles r on r.oid = m.roleid
         join pg_roles u on u.oid = m.member
        where u.rolname = 'ingest_writer'`,
    );
    assert.deepEqual(rows, []);
  });
});

describe('storage_cleaner role', () => {
  it('exists as NOLOGIN without BYPASSRLS and can only touch the queue', async () => {
    const { rows } = await roleFlags('storage_cleaner');
    assert.equal(rows[0].rolcanlogin, false);
    assert.equal(rows[0].rolbypassrls, false);
    const { rows: grants } = await db.query(
      `select distinct table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'storage_cleaner' and table_schema = 'public'
        order by 2`,
    );
    assert.deepEqual(grants.map((r) => r.table_name), Array(grants.length).fill('storage_deletion_queue'));
    assert.deepEqual(grants.map((r) => r.privilege_type), ['DELETE', 'SELECT', 'UPDATE']);
    await as(db, 'storage_cleaner', null, async (tx) => {
      const { rows: q } = await tx.query('select count(*)::int n from public.storage_deletion_queue');
      assert.equal(typeof q[0].n, 'number');
    });
    await assert.rejects(
      () => as(db, 'storage_cleaner', null, (tx) => tx.query('select 1 from public.places limit 1')),
      /permission denied|42501/,
    );
    await assert.rejects(
      () => as(db, 'storage_cleaner', null, (tx) =>
        tx.query(`insert into public.storage_deletion_queue (bucket_id, path, reason) values ('b','p','x')`)),
      /permission denied|42501/,
    );
  });
});

describe('rollback', () => {
  it('is not applied here; the down file drops the role after revoking grants', async () => {
    // Sanity check that the down file names the same policies and roles.
    const { readFileSync } = await import('node:fs');
    const down = readFileSync(new URL('../rollbacks/20261109004000_ingest_writer.down.sql', import.meta.url), 'utf8');
    assert.match(down, /drop role if exists ingest_writer/);
    assert.match(down, /ingest_writer writes places/);
    const down2 = readFileSync(new URL('../rollbacks/20261109004001_storage_cleaner.down.sql', import.meta.url), 'utf8');
    assert.match(down2, /drop role if exists storage_cleaner/);
  });
});
