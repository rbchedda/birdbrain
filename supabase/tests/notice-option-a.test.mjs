import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a3';
const bob = '00000000-0000-4000-8000-0000000000b3';
const cid = '11111111-1111-4111-8111-111111111111';
let db;
const dismiss = (user, f = {}) =>
  as(db, 'authenticated', user, (tx) =>
    tx.query(
      `insert into public.notice_acknowledgements (kind, notice_version, app_version, method, platform, dismissed_at, client_id)
       values ($1, '2026-10-23', '1.0.0', $2, 'ios', now(), $3)`,
      [f.kind ?? 'notice_dismiss', f.method ?? 'close', f.clientId ?? null],
    ),
  );
const consent = (user, notice) =>
  as(db, 'authenticated', user, (tx) =>
    tx.query(
      `insert into public.accepted_terms (app_version, terms_version, notice_version, platform)
       values ('1.0.0', 't1', $1, 'android')`,
      [notice],
    ),
  );

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice3@example.test');
  await createUser(db, bob, 'bob3@example.test');
});

describe('notice Option A columns (20261029000000)', () => {
  it('logs dismiss method, platform, device time; restore rows; legacy rows without method still OK', async () => {
    await dismiss(alice, { method: 'got_it' });
    await dismiss(alice, { kind: 'notice_restore', method: 'show_on_map' });
    await as(db, 'authenticated', alice, (tx) =>
      tx.query(`insert into public.notice_acknowledgements (kind, notice_version, app_version) values ('notice_dismiss','v','1')`));
    const { rows } = await db.query('select kind, method, platform from public.notice_acknowledgements where user_id = $1 order by id', [alice]);
    assert.deepEqual(rows.map((r) => [r.kind, r.method]), [['notice_dismiss', 'got_it'], ['notice_restore', 'show_on_map'], ['notice_dismiss', null]]);
  });
  it('rejects bad method/platform and replays of the same client_id', async () => {
    await assert.rejects(dismiss(alice, { method: 'swipe' }), /check constraint/);
    await dismiss(alice, { clientId: cid });
    await assert.rejects(dismiss(alice, { clientId: cid }), /duplicate key/);
    await dismiss(bob, { clientId: cid }); // per user
  });
  it('consent carries notice_version + platform; re-consent after a version bump is a new row', async () => {
    await consent(alice, 'n1');
    await consent(alice, 'n2');
    await assert.rejects(consent(alice, 'n2'), /duplicate key/);
    const r = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.accepted_terms'));
    assert.equal(r.rows.length, 0);
  });
  it('still no update/delete, no anon', async () => {
    await assert.rejects(as(db, 'authenticated', alice, (tx) => tx.query(`update public.notice_acknowledgements set method = 'close'`)), /permission denied/);
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.accepted_terms')), /permission denied/);
  });
  it('rollback restores the previous shape', async () => {
    await db.query(`delete from public.accepted_terms where notice_version = 'n2'`);
    await db.exec(readFileSync(new URL('../rollbacks/20261029000000_notice_option_a.down.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_name in ('accepted_terms','notice_acknowledgements') and column_name in ('method','platform','notice_version','client_id','dismissed_at')`);
    assert.deepEqual(rows.map((r) => r.column_name), ['notice_version']); // notice_acknowledgements.notice_version stays
  });
});
