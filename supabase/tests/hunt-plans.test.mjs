import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a7';
const bob = '00000000-0000-4000-8000-0000000000b7';
let db;
let n = 0;
const plan = (user, fields = {}) =>
  as(db, 'authenticated', user, (tx) =>
    tx.query(
      `insert into public.hunt_plans (user_id, client_id, place_id, planned_on, species, notes, reminder)
       values (coalesce($1, auth.uid()), $2, $3, $4, $5, $6, $7) returning id`,
      [
        fields.userId ?? null,
        fields.clientId ?? `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
        'sgl-211',
        '2026-10-31',
        ['pheasant'],
        fields.notes ?? null,
        fields.reminder ?? 'none',
      ],
    ),
  );

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice7@example.test');
  await createUser(db, bob, 'bob7@example.test');
});

describe('hunt_plans (local/PGlite only)', () => {
  it('owner can insert, read, update and delete their plan', async () => {
    const { rows } = await plan(alice, { notes: 'Dog: Juno' });
    const id = rows[0].id;
    const r = await as(db, 'authenticated', alice, (tx) => tx.query('select place_id, notes from public.hunt_plans'));
    assert.deepEqual(r.rows, [{ place_id: 'sgl-211', notes: 'Dog: Juno' }]);
    await as(db, 'authenticated', alice, (tx) => tx.query(`update public.hunt_plans set notes = 'x' where id = $1`, [id]));
    const del = await as(db, 'authenticated', alice, (tx) => tx.query('delete from public.hunt_plans where id = $1', [id]));
    assert.equal(del.affectedRows, 1);
  });
  it('is owner-only: others see, change and delete nothing', async () => {
    const { rows } = await plan(alice);
    const id = rows[0].id;
    const seen = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.hunt_plans'));
    assert.equal(seen.rows.length, 0);
    const up = await as(db, 'authenticated', bob, (tx) => tx.query(`update public.hunt_plans set notes = 'hacked' where id = $1`, [id]));
    assert.equal(up.affectedRows, 0);
    const del = await as(db, 'authenticated', bob, (tx) => tx.query('delete from public.hunt_plans where id = $1', [id]));
    assert.equal(del.affectedRows, 0);
    await assert.rejects(plan(bob, { userId: alice }), /row-level security/);
  });
  it('has no anon access and validates fields', async () => {
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.hunt_plans')), /permission denied/);
    await assert.rejects(
      as(db, 'anon', null, (tx) => tx.query(`insert into public.hunt_plans (client_id, place_id, planned_on) values (gen_random_uuid(), 'x', '2026-11-01')`)),
      /permission denied/,
    );
    await assert.rejects(plan(alice, { reminder: 'whenever' }), /check constraint/);
    await assert.rejects(plan(alice, { notes: 'x'.repeat(501) }), /check constraint/);
    const same = '00000000-0000-4000-8000-00000000abcd';
    await plan(alice, { clientId: same });
    await assert.rejects(plan(alice, { clientId: same }), /duplicate key/);
  });
  it('rollback drops the table', async () => {
    const down = readFileSync(new URL('../rollbacks/20261029000000_hunt_plans.down.sql', import.meta.url), 'utf8');
    const fresh = await createTestDb();
    await fresh.exec(down);
    const r = await fresh.query(`select to_regclass('public.hunt_plans') as t`);
    assert.equal(r.rows[0].t, null);
  });
});
