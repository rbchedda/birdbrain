import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';
const entry = '22222222-2222-4222-8222-222222222222';

const details = (extra = {}) => ({
  startTime: '07:30',
  species: ['pheasant'],
  dogs: [{ dogId: 'd1', name: 'Ruby', points: 3, flushes: 4, retrieves: 2 }],
  cover: ['standing_corn', 'field_edge'],
  hours: 3.5,
  miles: 4.2,
  flushes: 6,
  shots: 5,
  birds: [{ species: 'pheasant', count: 2, roosters: 2, hens: 0 }],
  weather: { tempF: 41, windMph: 8, windDir: 'NW', sky: 'overcast', precip: 'none' },
  photos: [{ id: 'p1', path: `${alice}/${entry}/p1.jpg` }],
  ...extra,
});

let db;
const upsert = (user, base, d, caption = 'opening day') =>
  as(db, 'authenticated', user, async (tx) =>
    (
      await tx.query('select * from public.upsert_diary_entry($1, $2, $3, $4, $5, $6, $7)', [
        entry, base, 'pheasant', caption, '2026-10-24', '[]', d === null ? null : JSON.stringify(d),
      ])
    ).rows[0],
  );
const stored = async () =>
  (
    await db.query(
      'select d.details from public.diary_entries d join public.hunt_log_entries e on e.id = d.entry_id where e.client_id = $1',
      [entry],
    )
  ).rows;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
});

describe('diary entries', () => {
  it('stores rich details with the hunt log entry, idempotently', async () => {
    assert.deepEqual(await upsert(alice, null, details()), { version: 1, conflict: false });
    assert.deepEqual(await upsert(alice, null, details()), { version: 1, conflict: false });
    const rows = await stored();
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].details, details());
  });

  it('bumps the version when only the details change, and detects stale edits', async () => {
    assert.deepEqual(await upsert(alice, 1, details({ shots: 7 })), { version: 2, conflict: false });
    assert.deepEqual(await upsert(alice, 1, details({ shots: 9 })), { version: 2, conflict: true });
    assert.equal((await stored())[0].details.shots, 7);
  });

  it('rejects invalid details', async () => {
    await assert.rejects(upsert(alice, 2, details({ cover: ['parking_lot'] })), /valid_diary_details|check constraint/);
    await assert.rejects(upsert(alice, 2, details({ shots: -1 })), /check constraint/);
    await assert.rejects(upsert(alice, 2, details({ startTime: '25:00' })), /check constraint/);
  });

  it('rejects photo paths outside the owner folder', async () => {
    await assert.rejects(upsert(alice, 2, details({ photos: [{ id: 'x', path: `${bob}/x.jpg` }] })), /outside your folder/);
  });
});

describe('diary privacy (owner-only RLS)', () => {
  it('denies other users and anon', async () => {
    const seen = await as(db, 'authenticated', bob, (tx) => tx.query('select * from public.diary_entries'));
    assert.equal(seen.rows.length, 0);
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select * from public.diary_entries')), /permission denied/);
    await assert.rejects(upsert(bob, 2, details({ photos: [] })), /client_id already in use/);
    const upd = await as(db, 'authenticated', bob, (tx) => tx.query(`update public.diary_entries set details = '{}'`));
    assert.equal(upd.affectedRows, 0);
  });

  it('does not let another user attach details to an entry they do not own', async () => {
    const entryId = (await db.query('select id from public.hunt_log_entries where client_id = $1', [entry])).rows[0].id;
    await db.query('delete from public.diary_entries where entry_id = $1', [entryId]);
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query('insert into public.diary_entries (entry_id, owner_id) values ($1, $2)', [entryId, bob]),
      ),
      /row-level security/,
    );
  });
});

describe('diary photos are private', () => {
  const insertPhoto = (user, name) =>
    as(db, 'authenticated', user, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name, owner) values ('diary-photos', $1, $2)`, [name, user]),
    );

  it('uses a private bucket', async () => {
    const { rows } = await db.query(`select public from storage.buckets where id = 'diary-photos'`);
    assert.equal(rows[0].public, false);
  });

  it('lets only the owner upload to and read their folder', async () => {
    await insertPhoto(alice, `${alice}/${entry}/p1.jpg`);
    await assert.rejects(insertPhoto(bob, `${alice}/${entry}/evil.jpg`), /row-level security/);
    const mine = await as(db, 'authenticated', alice, (tx) =>
      tx.query(`select name from storage.objects where bucket_id = 'diary-photos'`),
    );
    assert.equal(mine.rows.length, 1);
    const theirs = await as(db, 'authenticated', bob, (tx) =>
      tx.query(`select name from storage.objects where bucket_id = 'diary-photos'`),
    );
    assert.equal(theirs.rows.length, 0);
    const anon = await as(db, 'anon', null, (tx) => tx.query(`select name from storage.objects where bucket_id = 'diary-photos'`));
    assert.equal(anon.rows.length, 0);
  });

  it('stops other users deleting the owner photos', async () => {
    const del = await as(db, 'authenticated', bob, (tx) => tx.query(`delete from storage.objects where bucket_id = 'diary-photos'`));
    assert.equal(del.affectedRows, 0);
  });
});
