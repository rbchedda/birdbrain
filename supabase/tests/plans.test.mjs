import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

// Mirrors the hosted plans schema in hosted-changes-needed.md §2-3 via test-only fixtures
// (supabase/tests/fixtures), never supabase/migrations. Nothing here touches a hosted DB.
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const alice = '00000000-0000-4000-8000-0000000000a9'; // plan owner, crew admin
const bob = '00000000-0000-4000-8000-0000000000b9'; // crew member
const eve = '00000000-0000-4000-8000-0000000000e9'; // outsider
const cid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The exact statement the app sends (PostgREST upsert, ignoreDuplicates on user_id,client_id).
const UPSERT = `insert into public.plans (user_id, client_id, place_id, place_name, plan_date, species, notes, reminder)
  values (auth.uid(), $1, $2, $3, $4, $5, $6, $7) on conflict (user_id, client_id) do nothing returning id`;
const q = (d, user, sql, params = []) => as(d, user ? 'authenticated' : 'anon', user, (tx) => tx.query(sql, params));
const save = (d, user, client, f = {}) =>
  q(d, user, UPSERT, [client, f.place ?? 'sgl-211', 'SGL 211 · Stony Creek', f.date ?? '2026-10-31', ['pheasant'], f.notes ?? null, f.reminder ?? 'none']);

async function freshDb({ crewShare }) {
  const d = await createTestDb();
  await d.exec(fixture('plans.sql'));
  if (crewShare) await d.exec(fixture('plans_crew_share.sql'));
  for (const [id, e] of [[alice, 'a9'], [bob, 'b9'], [eve, 'e9']]) await createUser(d, id, `${e}@example.test`);
  return d;
}

describe('plans §2 (owner-only)', () => {
  let db;
  before(async () => {
    db = await freshDb({ crewShare: false });
  });

  it('owner CRUD with every reminder value', async () => {
    for (const [i, r] of ['none', 'night_before_8pm', 'hour_before_legal'].entries()) await save(db, alice, cid(i + 1), { reminder: r });
    const mine = await q(db, alice, 'select client_id, reminder from public.plans order by client_id');
    assert.deepEqual(mine.rows.map((r) => r.reminder), ['none', 'night_before_8pm', 'hour_before_legal']);
    const before = (await db.query('select updated_at from public.plans where client_id = $1', [cid(1)])).rows[0].updated_at;
    const up = await q(db, alice, `update public.plans set notes = 'Dog: Juno', plan_date = '2026-11-01' where client_id = $1`, [cid(1)]);
    assert.equal(up.affectedRows, 1);
    const after = (await db.query('select notes, updated_at from public.plans where client_id = $1', [cid(1)])).rows[0];
    assert.equal(after.notes, 'Dog: Juno');
    assert.ok(after.updated_at >= before);
    const del = await q(db, alice, 'delete from public.plans where client_id = $1', [cid(3)]);
    assert.equal(del.affectedRows, 1);
  });

  it('client_id dedupe: replaying the queued insert is a no-op', async () => {
    const first = await save(db, alice, cid(10), { notes: 'first' });
    assert.equal(first.rows.length, 1);
    const replay = await save(db, alice, cid(10), { notes: 'replayed' });
    assert.equal(replay.rows.length, 0);
    const r = await db.query('select notes from public.plans where client_id = $1', [cid(10)]);
    assert.deepEqual(r.rows, [{ notes: 'first' }]);
    // Another user may reuse the same client_id without clashing.
    assert.equal((await save(db, bob, cid(10))).rows.length, 1);
  });

  it('others see, change and delete nothing; anon has no access', async () => {
    await save(db, alice, cid(20));
    assert.equal((await q(db, eve, 'select * from public.plans where user_id = $1', [alice])).rows.length, 0);
    assert.equal((await q(db, eve, `update public.plans set notes = 'x' where client_id = $1`, [cid(20)])).affectedRows, 0);
    assert.equal((await q(db, eve, 'delete from public.plans where client_id = $1', [cid(20)])).affectedRows, 0);
    await assert.rejects(
      q(db, eve, `insert into public.plans (user_id, client_id, place_id, place_name, plan_date) values ($1, $2, 'x', 'x', '2026-11-01')`, [alice, cid(21)]),
      /row-level security/,
    );
    await assert.rejects(q(db, null, 'select * from public.plans'), /permission denied/);
    await assert.rejects(save(db, null, cid(22)), /permission denied/);
  });

  it('rejects bad values and owner/client_id changes', async () => {
    await assert.rejects(save(db, alice, cid(30), { reminder: 'night_before' }), /check constraint/);
    await assert.rejects(save(db, alice, cid(31), { notes: 'x'.repeat(501) }), /check constraint/);
    await assert.rejects(q(db, alice, `update public.plans set client_id = $1 where client_id = $2`, [cid(99), cid(20)]), /permission denied/);
    await assert.rejects(q(db, alice, `update public.plans set user_id = $1`, [bob]), /permission denied/);
  });

  it('crew_id must stay null until §3 is applied', async () => {
    const crew = (await q(db, alice, `select public.create_crew('Tuesday Dogs') id`)).rows[0].id;
    await save(db, alice, cid(40));
    await assert.rejects(q(db, alice, 'update public.plans set crew_id = $1 where client_id = $2', [crew, cid(40)]), /row-level security/);
  });

  it('rollback drops the table and trigger function', async () => {
    const d = await freshDb({ crewShare: false });
    await d.exec(fixture('plans.down.sql'));
    const r = await d.query(`select to_regclass('public.plans') t, to_regprocedure('public.plans_touch()') f`);
    assert.deepEqual(r.rows[0], { t: null, f: null });
  });
});

describe('plans §3 (crew read-only sharing)', () => {
  let db;
  let crew;
  let other;
  before(async () => {
    db = await freshDb({ crewShare: true });
    crew = (await q(db, alice, `select public.create_crew('Tuesday Dogs') id`)).rows[0].id;
    const token = (await q(db, alice, 'select * from public.create_crew_invite($1)', [crew])).rows[0].token;
    await q(db, bob, 'select public.join_crew($1)', [token]);
    other = (await q(db, eve, `select public.create_crew('Eve crew') id`)).rows[0].id;
  });

  it('owner shares to their crew; members read it but cannot change or delete it', async () => {
    await save(db, alice, cid(50));
    await q(db, alice, 'update public.plans set crew_id = $1 where client_id = $2', [crew, cid(50)]);
    const seen = await q(db, bob, 'select place_name, plan_date from public.plans where user_id = $1', [alice]);
    assert.equal(seen.rows.length, 1);
    assert.equal((await q(db, bob, `update public.plans set notes = 'x' where client_id = $1`, [cid(50)])).affectedRows, 0);
    assert.equal((await q(db, bob, 'delete from public.plans where client_id = $1', [cid(50)])).affectedRows, 0);
    assert.equal((await q(db, eve, 'select 1 from public.plans where user_id = $1', [alice])).rows.length, 0);
  });

  it('unsharing hides it from the crew again', async () => {
    await q(db, alice, 'update public.plans set crew_id = null where client_id = $1', [cid(50)]);
    assert.equal((await q(db, bob, 'select 1 from public.plans where user_id = $1', [alice])).rows.length, 0);
  });

  it("can't share to a crew you are not in", async () => {
    await save(db, alice, cid(51));
    await assert.rejects(q(db, alice, 'update public.plans set crew_id = $1 where client_id = $2', [other, cid(51)]), /row-level security/);
  });
});
