import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';
const entry = '11111111-1111-4111-8111-111111111111';
const counts = JSON.stringify([{ placeId: null, placeName: 'Back 40', flushed: 3, roosters: 1, harvested: 1 }]);

let db;
const upsert = (user, clientId, base, caption) =>
  as(db, 'authenticated', user, async (tx) =>
    (
      await tx.query('select * from public.upsert_hunt_log_entry($1, $2, $3, $4, $5, $6)', [
        clientId, base, 'pheasant', caption, '2026-10-20', counts,
      ])
    ).rows[0],
  );
const rowCount = async (clientId) =>
  Number((await db.query('select count(*) from public.hunt_log_entries where client_id = $1', [clientId])).rows[0].count);

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
});

describe('hunt log upsert', () => {
  it('inserts once and treats a repeated upload as a no-op', async () => {
    assert.deepEqual(await upsert(alice, entry, null, 'first'), { version: 1, conflict: false });
    // The response was lost and the device retries with no base version.
    assert.deepEqual(await upsert(alice, entry, null, 'first'), { version: 1, conflict: false });
    assert.deepEqual(await upsert(alice, entry, 1, 'first'), { version: 1, conflict: false });
    assert.equal(await rowCount(entry), 1);
  });

  it('applies an edit made on top of the current version', async () => {
    assert.deepEqual(await upsert(alice, entry, 1, 'edited'), { version: 2, conflict: false });
    const { rows } = await db.query('select caption, version, owner_id from public.hunt_log_entries where client_id = $1', [entry]);
    assert.deepEqual(rows[0], { caption: 'edited', version: 2, owner_id: alice });
  });

  it('reports a conflict for a stale edit and keeps the server copy', async () => {
    assert.deepEqual(await upsert(alice, entry, 1, 'stale edit'), { version: 2, conflict: true });
    assert.deepEqual(await upsert(alice, entry, null, 'never synced'), { version: 2, conflict: true });
    const { rows } = await db.query('select caption from public.hunt_log_entries where client_id = $1', [entry]);
    assert.equal(rows[0].caption, 'edited');
  });
});

describe('hunt log privacy (owner-only RLS)', () => {
  it('lets the owner read their entries', async () => {
    const { rows } = await as(db, 'authenticated', alice, (tx) => tx.query('select client_id from public.hunt_log_entries'));
    assert.deepEqual(rows.map((r) => r.client_id), [entry]);
  });

  it('hides entries from other signed-in users', async () => {
    const { rows } = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.hunt_log_entries'));
    assert.equal(rows.length, 0);
  });

  it('never exposes entries to anonymous visitors', async () => {
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.hunt_log_entries')), /permission denied/);
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.upsert_hunt_log_entry($1, null, null, $2, null, null)', [entry, 'x'])), /permission denied/);
  });

  it('stops other users from overwriting or claiming the entry', async () => {
    await assert.rejects(upsert(bob, entry, 2, 'hijack'), /client_id already in use/);
    const upd = await as(db, 'authenticated', bob, (tx) =>
      tx.query(`update public.hunt_log_entries set caption = 'x' where client_id = $1`, [entry]),
    );
    assert.equal(upd.affectedRows, 0);
    const del = await as(db, 'authenticated', bob, (tx) => tx.query('delete from public.hunt_log_entries where client_id = $1', [entry]));
    assert.equal(del.affectedRows, 0);
    assert.equal(await rowCount(entry), 1);
  });

  it('rejects inserts for another owner', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query('insert into public.hunt_log_entries (owner_id, client_id) values ($1, gen_random_uuid())', [alice]),
      ),
      /row-level security/,
    );
  });

  it('does not allow moving an entry to another owner', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) => tx.query('update public.hunt_log_entries set owner_id = $1 where client_id = $2', [bob, entry])),
      /row-level security|immutable/,
    );
  });
});

describe('hunt log and account deletion', () => {
  const carol = '00000000-0000-4000-8000-00000000000c';
  const carolEntry = '33333333-3333-4333-8333-333333333333';

  it('removes the user\'s hunt log entries when they delete their account', async () => {
    await createUser(db, carol, 'carol@example.test');
    await upsert(carol, carolEntry, null, 'carol hunt');
    assert.equal(await rowCount(carolEntry), 1);

    await as(db, 'authenticated', carol, (tx) => tx.query('select public.delete_my_account()'));

    assert.equal(await rowCount(carolEntry), 0);
    // Other users' entries are untouched.
    assert.equal(await rowCount(entry), 1);
  });
});

describe('hunt log function hardening', () => {
  it('runs every hunt log function with an empty search_path', async () => {
    const { rows } = await db.query(
      `select proname, proconfig from pg_proc
        where proname in ('upsert_hunt_log_entry', 'hunt_log_entries_guard') order by proname`,
    );
    assert.deepEqual(rows.map((r) => [r.proname, r.proconfig]), [
      ['hunt_log_entries_guard', ['search_path=""']],
      ['upsert_hunt_log_entry', ['search_path=""']],
    ]);
  });
});
