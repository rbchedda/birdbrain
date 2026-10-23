import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a2';
const bob = '00000000-0000-4000-8000-0000000000b2';
let db;
const ack = (role, user, fields = {}) =>
  as(db, role, user, (tx) =>
    tx.query(
      `insert into public.notice_acknowledgements (user_id, kind, notice_version, app_version)
       values (coalesce($1, auth.uid()), $2, $3, $4)`,
      [fields.userId ?? null, fields.kind ?? 'notice_dismiss', fields.notice ?? '2026-10-23', '1.0.0'],
    ),
  );

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice2@example.test');
  await createUser(db, bob, 'bob2@example.test');
});

describe('notice_acknowledgements', () => {
  it('logs a dismissal for the caller with versions and a timestamp', async () => {
    await ack('authenticated', alice);
    const { rows } = await db.query('select * from public.notice_acknowledgements where user_id = $1', [alice]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'notice_dismiss');
    assert.equal(rows[0].notice_version, '2026-10-23');
    assert.equal(rows[0].app_version, '1.0.0');
    assert.ok(rows[0].created_at);
  });
  it('owners see only their own rows', async () => {
    await ack('authenticated', bob);
    const r = await as(db, 'authenticated', alice, (tx) => tx.query('select user_id from public.notice_acknowledgements'));
    assert.deepEqual(r.rows.map((x) => x.user_id), [alice]);
  });
  it('refuses rows for another user, unknown kinds, updates, deletes and anon', async () => {
    await assert.rejects(ack('authenticated', alice, { userId: bob }), /row-level security/);
    await assert.rejects(ack('authenticated', alice, { kind: 'other' }), /check constraint/);
    await assert.rejects(as(db, 'authenticated', alice, (tx) => tx.query(`update public.notice_acknowledgements set notice_version = 'x'`)), /permission denied/);
    await assert.rejects(as(db, 'authenticated', alice, (tx) => tx.query('delete from public.notice_acknowledgements')), /permission denied/);
    await assert.rejects(ack('anon', null), /permission denied/);
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.notice_acknowledgements')), /permission denied/);
  });
});
