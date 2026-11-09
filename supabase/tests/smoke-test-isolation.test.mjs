// PGlite: smoke-test account isolation (20261105000200). Repo only; not applied to hosted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { as, createTestDb, createUser } from './db.mjs';

const T = '00000000-0000-0000-0000-00000000aaaa';
const R = '00000000-0000-0000-0000-00000000bbbb';
const rollback2001 = readFileSync(new URL('../rollbacks/20261109002001_is_test_account_auth_uid.down.sql', import.meta.url), 'utf8');
const rollback2000 = readFileSync(new URL('../rollbacks/20261109002000_smoke_guards_groups_profiles.down.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../rollbacks/20261105000200_smoke_test_isolation.down.sql', import.meta.url), 'utf8');

test('test account is isolated, owner-only writes still work, rollback is clean', async () => {
  const db = await createTestDb();
  await createUser(db, T, 'smoke@example.test');
  await createUser(db, R, 'real@example.test');
  await db.query('insert into private.test_accounts (user_id) values ($1)', [T]);

  await assert.rejects(
    as(db, 'authenticated', T, (tx) => tx.query(`select public.create_crew('Smoke crew')`)),
    (e) => e.code === '42501' && /test accounts cannot write/.test(e.message),
  );
  // Specific error: the guard trigger, not a column/enum/RLS failure.
  await assert.rejects(
    as(db, 'authenticated', T, (tx) =>
      tx.query(`insert into public.posts (author_id, species) values ($1, 'pheasant')`, [T])),
    (e) => e.code === '42501' && e.message === 'test accounts cannot write posts',
  );
  // Real users unaffected.
  await as(db, 'authenticated', R, (tx) => tx.query(`select public.create_crew('Real crew')`));
  const crew = await db.query(`select g.id from public.groups g join public.group_members m on m.group_id = g.id where m.user_id = $1 limit 1`, [R]);

  await as(db, 'authenticated', T, async (tx) => {
    await tx.query(`select * from public.upsert_diary_entry(gen_random_uuid(), null, 'grouse', '[smoke] x', current_date, '[]', '{"hours":1}')`);
    await tx.query(`insert into public.plans (client_id, place_id, place_name, plan_date, notes) values (gen_random_uuid(),'p','[smoke] p',current_date,'[smoke]')`);
    assert.equal((await tx.query(`select count(*)::int n from public.hunt_log_entries`)).rows[0].n, 1);
    assert.equal((await tx.query(`select count(*)::int n from public.plans`)).rows[0].n, 1);
    assert.equal((await tx.query(`select public.is_test_account() v`)).rows[0].v, true);
  });
  // Plan guard (fires even before crew RLS).
  assert.ok(crew.rows[0], 'real crew exists');
  {
    await assert.rejects(
      as(db, 'authenticated', T, (tx) => tx.query(`update public.plans set crew_id = $1`, [crew.rows[0].id])),
      (e) => e.code === '42501' && e.message === 'test accounts cannot share plans',
    );
  }
  await assert.rejects(as(db, 'authenticated', T, (tx) => tx.query('select * from private.test_accounts')));
  await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select public.is_test_account()')));

  await db.exec('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, name text);');
  // Later isolation migrations add a groups trigger and a profile guard that
  // depend on these functions; roll those back first, then the original file.
  await db.exec(rollback2001);
  await db.exec(rollback2000);
  await db.exec(rollback);
  assert.equal((await db.query(`select to_regclass('private.test_accounts') t`)).rows[0].t, null);
  assert.equal((await db.query(`select count(*)::int n from pg_trigger where tgname in ('guard_test_account','guard_test_account_plan')`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from pg_namespace where nspname = 'private'`)).rows[0].n, 1);
});
