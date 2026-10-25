import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const entry = '33333333-3333-4333-8333-333333333333';
let db;

const save = (species, details, base = null) =>
  as(db, 'authenticated', alice, async (tx) =>
    (
      await tx.query('select * from public.upsert_diary_entry($1, $2, $3, $4, $5, $6, $7)', [
        entry, base, species, '', '2026-11-14', '[]', JSON.stringify(details),
      ])
    ).rows[0],
  );

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
});

describe('woodcock is a loggable species', () => {
  it('is in the species enum', async () => {
    const { rows } = await db.query(`select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'species' order by e.enumsortorder`);
    assert.deepEqual(rows.map((r) => r.enumlabel), ['pheasant', 'dove', 'turkey', 'grouse', 'waterfowl', 'woodcock']);
  });

  it('saves a woodcock hunt with woodcock in its details', async () => {
    assert.deepEqual(await save('woodcock', { species: ['woodcock', 'grouse'], flushes: 12, hours: 2 }), { version: 1, conflict: false });
  });

  it('still rejects an unknown species in details', async () => {
    await assert.rejects(save('woodcock', { species: ['snipe'] }, 1), /check constraint/);
  });
});
