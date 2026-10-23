import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';

let db;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await db.exec(`
    insert into public.stocking_events
      (season, region, county, release, release_label, junior, ship_week, window_start, window_end, cocks, hens, source)
    values
      ('2026-27', 'Northcentral', 'Centre', 'youth', 'YOUTH HUNT', true, 'Oct 8-9', '2026-10-08', '2026-10-09', 160, 60, 'test'),
      ('2026-27', 'Northcentral', 'Centre', 'pre_season', 'PRE- SEASON', false, 'Oct 21-23', '2026-10-21', '2026-10-23', 480, 170, 'test');
    insert into public.stocking_properties (season, region, county, name, sgl, winter_late, source)
    values ('2026-27', 'Northcentral', 'Centre', 'State Game Lands 333', 333, true, 'test');
  `);
});

describe('stocking allocation tables', () => {
  for (const role of ['anon', 'authenticated']) {
    it(`are readable by ${role} users, including the county totals view`, async () => {
      const { rows } = await as(db, role, role === 'anon' ? null : alice, (tx) =>
        tx.query(`select (select count(*) from public.stocking_events)::int events,
                         (select count(*) from public.stocking_properties)::int properties,
                         (select adult_cocks from public.stocking_county_totals where county = 'Centre') adult_cocks`));
      assert.deepEqual(rows[0], { events: 2, properties: 1, adult_cocks: 480 });
    });
  }

  it('cannot be written by signed-in users', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(`insert into public.stocking_properties (season, region, county, name, source)
                  values ('2026-27', 'Northcentral', 'Centre', 'My secret spot', 'x')`)),
      /row-level security|permission denied/,
    );
    // Either RLS filters every row or the grant is revoked outright; both mean no write.
    const noRows = (p) => p.then((r) => r.rows.length, (e) => (/permission denied/.test(e.message) ? 0 : Promise.reject(e)));
    assert.equal(await noRows(as(db, 'authenticated', alice, (tx) =>
      tx.query(`update public.stocking_events set cocks = 9999 returning id`))), 0);
    assert.equal(await noRows(as(db, 'anon', null, (tx) => tx.query('delete from public.stocking_events returning id'))), 0);
  });

  it('rejects malformed rows', async () => {
    await assert.rejects(db.query(
      `insert into public.stocking_events
         (season, region, county, release, release_label, junior, ship_week, window_start, window_end, cocks, hens, source)
       values ('2026', 'X', 'Y', 'bonus', 'B', false, 'w', '2026-10-09', '2026-10-08', -1, 0, 's')`,
    ), /check constraint/);
  });
});
