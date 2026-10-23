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
       on conflict do nothing`,
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

  it('refuses inserts from anonymous (guest) sign-ins, which use the authenticated role', async () => {
    const guest = '00000000-0000-4000-8000-0000000000c1';
    await db.query('insert into auth.users (id, email, is_anonymous) values ($1, null, true)', [guest]);
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query('set local role authenticated');
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: guest, role: 'authenticated', is_anonymous: true }),
        ]);
        await tx.query(`insert into public.accepted_terms (app_version, terms_version) values ('1', '1')`);
      }),
      /row-level security/,
    );
    const { rows } = await db.query('select 1 from public.accepted_terms where user_id = $1', [guest]);
    assert.equal(rows.length, 0);
  });

  it('gives two accounts accepting on one device a row each', async () => {
    const carol = '00000000-0000-4000-8000-0000000000d1';
    const dave = '00000000-0000-4000-8000-0000000000d2';
    await createUser(db, carol, 'carol@example.test');
    await createUser(db, dave, 'dave@example.test');
    // Same device acceptance (same time, build and version) sent for each sign-in.
    const device = { acceptedAt: '2026-10-22T13:00:00Z', appVersion: '1.0.0' };
    await accept(carol, '2026-10-22', device);
    await accept(dave, '2026-10-22', device);
    await accept(carol, '2026-10-22', device); // carol signs in again: no duplicate
    const { rows } = await db.query('select user_id from public.accepted_terms where user_id in ($1, $2) order by id', [carol, dave]);
    assert.deepEqual(rows.map((r) => r.user_id), [carol, dave]);
  });

  it('has no index duplicating the (user_id, terms_version) unique key', async () => {
    const { rows } = await db.query(`select indexname from pg_indexes where schemaname = 'public' and tablename = 'accepted_terms'`);
    assert.ok(!rows.some((r) => r.indexname === 'accepted_terms_user_idx'));
    assert.equal(rows.length, 2); // primary key + unique (user_id, terms_version)
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
