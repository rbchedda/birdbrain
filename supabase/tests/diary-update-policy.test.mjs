import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';
const aliceClient = '55555555-5555-4555-8555-555555555555';
const aliceClient2 = '66666666-6666-4666-8666-666666666666';
const bobClient = '77777777-7777-4777-8777-777777777777';

let db;
const upsert = (user, clientId) =>
  as(db, 'authenticated', user, (tx) =>
    tx.query('select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5, $6)', [
      clientId, 'pheasant', 'hunt', '2026-10-24', '[]', JSON.stringify({ shots: 1, photos: [] }),
    ]),
  );
const entryId = async (clientId) =>
  (await db.query('select id from public.hunt_log_entries where client_id = $1', [clientId])).rows[0].id;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  await upsert(alice, aliceClient);
  await upsert(alice, aliceClient2);
  await upsert(bob, bobClient);
});

describe('diary_entries update ownership', () => {
  it('denies repointing your diary row at another user’s hunt log entry', async () => {
    const mine = await entryId(aliceClient);
    const bobs = await entryId(bobClient);
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query('update public.diary_entries set entry_id = $1 where entry_id = $2', [bobs, mine]),
      ),
      /row-level security/,
    );
    const { rows } = await db.query('select owner_id from public.diary_entries where entry_id = $1', [bobs]);
    assert.deepEqual(rows.map((r) => r.owner_id), [bob]);
  });

  it('denies handing your row to another owner', async () => {
    const mine = await entryId(aliceClient);
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) => tx.query('update public.diary_entries set owner_id = $1 where entry_id = $2', [bob, mine])),
      /row-level security/,
    );
  });

  it('still allows the owner to edit details and to move between their own entries', async () => {
    const mine = await entryId(aliceClient);
    const res = await as(db, 'authenticated', alice, (tx) =>
      tx.query(`update public.diary_entries set details = '{"shots": 2}' where entry_id = $1`, [mine]),
    );
    assert.equal(res.affectedRows, 1);
    const mine2 = await entryId(aliceClient2);
    await db.query('delete from public.diary_entries where entry_id = $1', [mine2]);
    const moved = await as(db, 'authenticated', alice, (tx) =>
      tx.query('update public.diary_entries set entry_id = $1 where entry_id = $2', [mine2, mine]),
    );
    assert.equal(moved.affectedRows, 1);
  });

  it('keeps upsert_diary_entry edits working under the new policy', async () => {
    const r = await as(db, 'authenticated', bob, (tx) =>
      tx.query('select * from public.upsert_diary_entry($1, 1, $2, $3, $4, $5, $6)', [
        bobClient, 'pheasant', 'hunt edited', '2026-10-24', '[]', JSON.stringify({ shots: 5, photos: [] }),
      ]),
    );
    assert.deepEqual(r.rows[0], { version: 2, conflict: false });
  });
});
