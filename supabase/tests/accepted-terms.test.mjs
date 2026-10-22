import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b1';

let db;
const accept = (user, terms = '2026-10-22', fields = {}) =>
  as(db, 'authenticated', user, (tx) =>
    tx.query(
      `insert into public.accepted_terms (user_id, accepted_at, app_version, terms_version)
       values (coalesce($1, auth.uid()), coalesce($2::timestamptz, now()), $3, $4)
       on conflict (user_id, terms_version) do nothing`,
      [fields.userId ?? null, fields.acceptedAt ?? null, fields.appVersion ?? '1.0.0', terms],
    ),
  );
const rowsAs = (user) => as(db, 'authenticated', user, (tx) => tx.query('select user_id, terms_version, app_version from public.accepted_terms order by id'));

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
});

describe('accepted_terms', () => {
  it('logs an acceptance with user, time, app version and terms version', async () => {
    await accept(alice, '2026-10-22', { acceptedAt: '2026-10-22T13:00:00Z', appVersion: '1.0.0' });
    const { rows } = await db.query('select * from public.accepted_terms where user_id = $1', [alice]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].app_version, '1.0.0');
    assert.equal(rows[0].terms_version, '2026-10-22');
    assert.equal(new Date(rows[0].accepted_at).toISOString(), '2026-10-22T13:00:00.000Z');
  });

  it('defaults user_id to the caller', async () => {
    await accept(bob);
    const { rows } = await db.query('select user_id from public.accepted_terms where user_id = $1', [bob]);
    assert.equal(rows.length, 1);
  });

  it('shows each user only their own rows', async () => {
    assert.deepEqual((await rowsAs(alice)).rows.map((r) => r.user_id), [alice]);
    assert.deepEqual((await rowsAs(bob)).rows.map((r) => r.user_id), [bob]);
  });

  it('refuses inserting a row for another user', async () => {
    await assert.rejects(accept(alice, 'x', { userId: bob }), /row-level security/);
  });

  it('refuses updates and deletes, even of your own rows', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) => tx.query(`update public.accepted_terms set terms_version = 'forged'`)),
      /permission denied/,
    );
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) => tx.query('delete from public.accepted_terms')),
      /permission denied/,
    );
  });

  it('denies anonymous (signed-out) reads and writes', async () => {
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.accepted_terms')), /permission denied/);
    await assert.rejects(
      as(db, 'anon', null, (tx) =>
        tx.query(`insert into public.accepted_terms (user_id, app_version, terms_version) values ($1, '1', '1')`, [alice]),
      ),
      /permission denied/,
    );
  });

  it('treats re-sending the same terms version as a no-op and records a new version', async () => {
    await accept(alice, '2026-10-22');
    await accept(alice, '2026-11-01');
    assert.deepEqual((await rowsAs(alice)).rows.map((r) => r.terms_version), ['2026-10-22', '2026-11-01']);
  });

  it('rejects acceptance times in the future', async () => {
    await assert.rejects(accept(alice, 'future', { acceptedAt: '2099-01-01T00:00:00Z' }), /check constraint/);
  });

  it('removes the rows when the account is deleted', async () => {
    await as(db, 'authenticated', bob, (tx) => tx.query('select public.delete_my_account()'));
    const { rows } = await db.query('select 1 from public.accepted_terms where user_id = $1', [bob]);
    assert.equal(rows.length, 0);
    assert.equal((await rowsAs(alice)).rows.length, 2);
  });
});
